// Sprint 61 — Auto-ingest uploaded project files into project-scoped Knowledge Base.
//
// Зачем:
//   До Sprint 61 загруженные файлы (pitch-deck PDF, финмодель XLSX) парсились
//   ровно один раз — в briefService — и схлопывались в 1-2 строки brief.businessSummary.
//   На /sales-assistant/analyze они не были доступны как retrievable knowledge.
//
//   Этот сервис делает их retrievable:
//     1. Парсит файл через существующий fileParser.extractFromUploadedFile.
//     2. Создаёт KnowledgeSource(scope='project', projectId, sourceType=…)
//        — auto-публикация, isCandidate=false (доверяем владельцу проекта;
//        founder не увидит raw snippet благодаря visibilityFor).
//     3. Чанкирует и сохраняет KnowledgeChunk'и через ingestKnowledgeSource.
//     4. Дедуп по contentHash — повторная загрузка того же файла вернёт
//        existing source без создания дубля.
//
// Идемпотентность:
//   ingestKnowledgeSource уже делает contentHash-дедуп. Дополнительно мы
//   ничего не делаем: тот же uploadedFileId с тем же контентом → existing
//   source. Это purely safe.
//
// Failure semantics:
//   Никогда не бросаем наверх. Логируем и возвращаем status. Caller (upload
//   handler) запускает fire-and-forget — упавший ingest не должен влиять на
//   успех самого upload'а.

import { prisma } from '../db.js';
import { ingestKnowledgeSource, type KnowledgeSourceType, type KnowledgeEnvironment } from './knowledgeService.js';

export type ProjectFileIngestStatus =
  | 'ingested'           // success — новый KnowledgeSource создан
  | 'duplicate'          // success — existing source найден (контент тот же)
  | 'skipped_format'     // image / logo / unsupported mime — не парсим
  | 'skipped_short'      // файл слишком короткий после парсинга (<40 chars)
  | 'skipped_link'       // внешний URL без локального файла — отдельная история
  | 'file_not_found'     // UploadedFile row не существует или archivedAt set
  | 'project_mismatch'   // projectId не совпадает с UploadedFile.projectId
  | 'parse_failed'       // fileParser вернул error
  | 'ingest_failed';     // exception от ingestKnowledgeSource

export interface ProjectFileIngestResult {
  status: ProjectFileIngestStatus;
  uploadedFileId: string;
  sourceId?: string;
  chunkCount?: number;
  sourceType?: KnowledgeSourceType;
  duplicate?: boolean;
  reason?: string;
  durationMs: number;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function ingestProjectFileToKnowledge(
  uploadedFileId: string,
  expectedProjectId?: string | null,
  options: {
    environment?: KnowledgeEnvironment;
    createdById?: string | null;
  } = {},
): Promise<ProjectFileIngestResult> {
  const started = Date.now();
  const fail = (status: ProjectFileIngestStatus, reason?: string): ProjectFileIngestResult => ({
    status,
    uploadedFileId,
    reason,
    durationMs: Date.now() - started,
  });

  const file = await prisma.uploadedFile.findUnique({ where: { id: uploadedFileId } });
  if (!file || file.archivedAt) return fail('file_not_found');

  if (expectedProjectId && file.projectId !== expectedProjectId) {
    return fail('project_mismatch', `expected=${expectedProjectId} actual=${file.projectId}`);
  }

  // External link — не индексируем (нет локального контента, fetch внешних
  // URL'ов out of scope для этого сервиса).
  if (file.url && !file.path) {
    return fail('skipped_link', `external url=${file.url}`);
  }

  if (!isIngestibleMime(file.mimeType, file.originalName)) {
    return fail('skipped_format', `mime=${file.mimeType} name=${file.originalName}`);
  }

  const sourceType = pickSourceTypeForFile(file.category, file.mimeType, file.originalName);
  const title = buildTitle(file.originalName, file.category);

  try {
    const out = await ingestKnowledgeSource({
      scope: 'project',
      projectId: file.projectId,
      title,
      sourceType,
      status: 'published',
      visibility: 'internal',     // raw snippet видят только admin/manager (founder — нет)
      isCandidate: false,         // доверяем владельцу проекта; не отправляем в admin-review
      uploadedFileId: file.id,
      tags: ['project_file', file.category, sourceType],
      summary: `Загруженный файл проекта: ${file.originalName} (категория ${file.category})`,
      originType: 'file_upload',
      originId: file.id,
      environment: options.environment ?? 'production',
      createdById: options.createdById ?? null,
    });
    return {
      status: out.duplicate ? 'duplicate' : 'ingested',
      uploadedFileId: file.id,
      sourceId: out.sourceId,
      chunkCount: out.chunkCount,
      sourceType,
      duplicate: out.duplicate,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg === 'knowledge_source_text_too_short') {
      return fail('skipped_short', msg);
    }
    console.warn(`[project-kb] ingest_failed uploadedFileId=${file.id} reason=${msg.slice(0, 200)}`);
    return fail('ingest_failed', msg.slice(0, 200));
  }
}

// Удобный wrapper: запустить ingestion fire-and-forget из upload-route'а.
// Логирует исход; не возвращает Promise, который роут ждёт.
export function scheduleProjectFileIngest(
  uploadedFileId: string,
  projectId: string,
  options: { environment?: KnowledgeEnvironment; createdById?: string | null } = {},
): void {
  ingestProjectFileToKnowledge(uploadedFileId, projectId, options)
    .then((result) => {
      // Лог формат единый, чтобы можно было grep'нуть [project-kb] в проде.
      const sourceLabel = result.sourceId ?? 'no_source';
      console.log(
        `[project-kb] uploadedFileId=${uploadedFileId} project=${projectId} ` +
        `status=${result.status} sourceId=${sourceLabel} ` +
        `chunks=${result.chunkCount ?? 0} dup=${result.duplicate ? '1' : '0'} ` +
        `durationMs=${result.durationMs}` +
        (result.reason ? ` reason="${result.reason}"` : ''),
      );
    })
    .catch((err) => {
      console.warn(`[project-kb] uploadedFileId=${uploadedFileId} unhandled error:`, err);
    });
}

// ─── Internal helpers ──────────────────────────────────────────────────────

// Какие mime/ext мы умеем парсить через fileParser. Должно соответствовать
// extractFromUploadedFile в server/src/services/fileParser.ts.
function isIngestibleMime(mime: string, originalName: string): boolean {
  const ext = lastExt(originalName);
  if (ext === '.pdf' || mime === 'application/pdf') return true;
  if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  if (ext === '.xlsx' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true;
  if (ext === '.txt' || ext === '.md') return true;
  if (mime.startsWith('text/')) return true;
  // image/* / video/* / audio/* / PPT (без PPTX text extractor) — не индексируем.
  return false;
}

function lastExt(name: string): string {
  const m = name.match(/\.[a-z0-9]+$/i);
  return m ? m[0].toLowerCase() : '';
}

// Выбор sourceType по category + mime. Используем существующий taxonomy
// enum (KNOWLEDGE_SOURCE_TYPES), без новых значений.
//
//   category='financial' OR XLSX                  → 'financial_question'
//   category='pitch' / 'description' / 'reference'→ 'project_presentation'
//   PDF/DOCX/MD по умолчанию                       → 'project_presentation'
//   Прочее                                         → 'other'
function pickSourceTypeForFile(category: string, mime: string, originalName: string): KnowledgeSourceType {
  const cat = (category ?? '').toLowerCase();
  const ext = lastExt(originalName);
  if (cat === 'financial' || ext === '.xlsx' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'financial_question';
  }
  if (cat === 'pitch' || cat === 'description' || cat === 'reference') {
    return 'project_presentation';
  }
  if (ext === '.pdf' || ext === '.docx' || ext === '.md' || ext === '.txt') {
    return 'project_presentation';
  }
  return 'other';
}

function buildTitle(originalName: string, category: string): string {
  if (!category || category === 'other') return originalName;
  return `[${category}] ${originalName}`;
}
