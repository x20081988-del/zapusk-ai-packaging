import { createHash } from 'node:crypto';
import { prisma } from '../db.js';

type TemplateLike = {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  body: string;
  active: boolean;
  provider: string | null;
  tool: string | null;
  model: string | null;
  outputType: string | null;
  version?: number | null;
  checksum?: string | null;
};

type TemplatePatch = Partial<Pick<TemplateLike,
  'name' | 'category' | 'description' | 'body' | 'active' | 'provider' | 'tool' | 'model' | 'outputType'
>>;

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^"'\s]{12,}/gi,
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/gi,
];

export function checksumTemplate(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

export function assertNoPromptSecrets(body: string | undefined): void {
  if (!body) return;
  if (SECRET_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(body);
  })) {
    const err = new Error('prompt_body_contains_secret_like_value');
    err.name = 'PromptTemplateSecretError';
    throw err;
  }
}

export function isPromptTemplateSecretError(err: unknown): boolean {
  return err instanceof Error && err.name === 'PromptTemplateSecretError';
}

export async function createInitialPromptTemplateVersion(templateId: string, changedById: string | null): Promise<void> {
  const template = await prisma.promptTemplate.findUnique({ where: { id: templateId } });
  if (!template) return;
  await ensurePromptTemplateVersion(template, changedById);
}

export async function updatePromptTemplateWithVersion(
  templateId: string,
  patch: TemplatePatch,
  changedById: string | null,
) {
  assertNoPromptSecrets(patch.body);
  const existing = await prisma.promptTemplate.findUnique({ where: { id: templateId } });
  if (!existing) return null;

  const previous = await ensurePromptTemplateVersion(existing, changedById);
  const next = {
    ...existing,
    ...patch,
  };
  const nextVersion = (existing.version ?? 1) + 1;
  const nextChecksum = checksumTemplate(next.body);
  const diffSummary = summarizeTemplateDiff(existing, next);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const versionRow = await tx.promptTemplateVersion.create({
      data: {
        templateId: existing.id,
        version: nextVersion,
        checksum: nextChecksum,
        previousVersionId: previous.id,
        changedById,
        publishedAt: now,
        key: next.key,
        name: next.name,
        category: next.category,
        description: next.description ?? null,
        body: redactPromptSecrets(next.body),
        active: next.active,
        provider: next.provider ?? null,
        tool: next.tool ?? null,
        model: next.model ?? null,
        outputType: next.outputType ?? null,
        diffSummary,
      },
    });

    const updated = await tx.promptTemplate.update({
      where: { id: existing.id },
      data: {
        ...patch,
        version: nextVersion,
        checksum: nextChecksum,
        previousVersionId: previous.id,
        changedById,
        publishedAt: now,
      },
    });

    return { template: updated, version: versionRow };
  });

  return result;
}

export async function getPromptTemplateHistory(templateId: string) {
  const template = await prisma.promptTemplate.findUnique({ where: { id: templateId } });
  if (!template) return null;
  const versions = await prisma.promptTemplateVersion.findMany({
    where: { templateId },
    orderBy: { version: 'desc' },
    take: 100,
  });
  const changedByIds = Array.from(new Set(versions.map((v) => v.changedById).filter((id): id is string => Boolean(id))));
  const users = changedByIds.length
    ? await prisma.user.findMany({
        where: { id: { in: changedByIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const history = versions.length ? versions : [{
    id: template.id,
    templateId: template.id,
    version: template.version ?? 1,
    checksum: template.checksum ?? checksumTemplate(template.body),
    previousVersionId: template.previousVersionId ?? null,
    changedById: template.changedById ?? null,
    publishedAt: template.publishedAt ?? template.updatedAt,
    key: template.key,
    name: template.name,
    category: template.category,
    description: template.description,
    body: redactPromptSecrets(template.body),
    active: template.active,
    provider: template.provider,
    tool: template.tool,
    model: template.model,
    outputType: template.outputType,
    diffSummary: 'Текущая версия без сохранённой истории',
    createdAt: template.updatedAt,
  }];

  return {
    template: {
      id: template.id,
      key: template.key,
      name: template.name,
      version: template.version ?? 1,
      checksum: template.checksum ?? checksumTemplate(template.body),
      publishedAt: template.publishedAt,
    },
    history: history.map((v) => ({
      id: v.id,
      version: v.version,
      checksum: v.checksum,
      previousVersionId: v.previousVersionId,
      diffSummary: v.diffSummary,
      createdAt: v.createdAt,
      publishedAt: v.publishedAt,
      author: v.changedById ? byId.get(v.changedById) ?? { id: v.changedById, email: null, name: null } : null,
    })),
  };
}

async function ensurePromptTemplateVersion(template: TemplateLike, changedById: string | null) {
  const version = template.version ?? 1;
  const existing = await prisma.promptTemplateVersion.findUnique({
    where: { templateId_version: { templateId: template.id, version } },
  });
  if (existing) return existing;
  return prisma.promptTemplateVersion.create({
    data: {
      templateId: template.id,
      version,
      checksum: template.checksum ?? checksumTemplate(template.body),
      previousVersionId: null,
      changedById,
      publishedAt: null,
      key: template.key,
      name: template.name,
      category: template.category,
      description: template.description,
      body: redactPromptSecrets(template.body),
      active: template.active,
      provider: template.provider,
      tool: template.tool,
      model: template.model,
      outputType: template.outputType,
      diffSummary: 'Снимок версии до изменения',
    },
  });
}

function summarizeTemplateDiff(prev: TemplateLike, next: TemplateLike): string {
  const changed: string[] = [];
  for (const field of ['name', 'category', 'description', 'active', 'provider', 'tool', 'model', 'outputType'] as const) {
    if (prev[field] !== next[field]) changed.push(field);
  }
  if (prev.body !== next.body) {
    const delta = next.body.length - prev.body.length;
    changed.push(`body (${delta >= 0 ? '+' : ''}${delta} chars)`);
  }
  return changed.length ? `Изменено: ${changed.join(', ')}` : 'Версия опубликована без видимых изменений';
}

function redactPromptSecrets(body: string): string {
  let out = body;
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, '[secret-redacted]');
  }
  return out;
}
