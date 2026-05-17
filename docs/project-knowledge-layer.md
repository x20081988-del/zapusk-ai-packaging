# Project Knowledge Layer — what the AI Sales Assistant knows about a project

> Status: Sprint 61 baseline.
>
> Production-truth principle: **Realtime is UX. Offline is truth. AI analysis happens after.**
> See also `docs/transcript-architecture.md`.

This document explains exactly what reaches the AI prompt of `/sales-assistant/analyze` (and `analyze-fast`, and `prepareForMeeting`) — and where the gaps still are.

## 1. Layered context

The AI Assistant sees four concentric layers of project knowledge, ordered by reliability:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. STRUCTURED PROJECT CONTEXT  (deterministic, always injected)     │
│    Project row + ProjectBrief + InvestorTerms + UploadedFile list   │
├─────────────────────────────────────────────────────────────────────┤
│ 2. FINANCIAL FACTS BLOCK  (deterministic, conditional)              │
│    Only when transcript triggers finance keywords;                  │
│    Each fact carries explicit [source: …] tag.                      │
├─────────────────────────────────────────────────────────────────────┤
│ 3. PROJECT-SCOPED KB CHUNKS  (retrieved, conditional)               │
│    Parsed pitch-deck + financial-model + docs become                │
│    KnowledgeSource(scope='project') chunks at upload time.          │
├─────────────────────────────────────────────────────────────────────┤
│ 4. GLOBAL SALES KB CHUNKS  (retrieved, conditional)                 │
│    Curated successful_sale / objection / qualification cases.       │
│    Used as generic guidance, NOT as project facts.                  │
└─────────────────────────────────────────────────────────────────────┘
```

Plus two unchanged adjacent layers:

- NegotiationMemory (last 3 contacts with this investor) — `buildMemoryBlock`.
- Qualification scripts — `qualificationContextLines` (when `mode='qualification'`).

## 2. Layer 1 — Structured Project Context

**Source code:** `server/src/services/projectContextFormatter.ts`

**Pure formatter:** `formatProjectContextForAssistant(project, options)` does not touch Prisma. The DB loader `loadProjectForContext(projectId)` (lazy-imports prisma) hydrates a `LoadedProject` shape.

**Three verbosities:**

| Verbosity | Used in | Per-project cap | File list | Weaknesses | missingData | Interview answers |
|---|---|---|---|---|---|---|
| `full` | `analyzeSalesTurn` | 4 000 chars | ✅ | ✅ | ✅ | up to 6 |
| `prep` | `prepareForMeeting` | 4 000 chars | ✅ | ✅ | ❌ | up to 5 |
| `fast` | `analyzeSalesTurnFast` | 1 500 chars | ❌ | ❌ | ❌ | ❌ |

**Fields included (compact, 1 line each):**

- Project: `name`, `industry`, `stage`, `raiseAmount/currency`, `equityOffered`, `minCheck`, `investorType`, `investmentTrack`
- Brief: `businessSummary`, `monetization`, `investmentAsk`, `keyMetrics` (JSON → key=value list), `napkin` (JSON → key=value list, all keys not just `investorReturn`), `strengths`, `weaknesses`, `missingData`, `interviewAnswers` (top-N latest)
- InvestorTerms: `amount`, `equityPercent`, `valuation`, `instrument`, `useOfFunds`, `exitStrategy`, `expectedReturn`, `payback`
- Files: list of `originalName · category · mime-shortlabel` (no content, just metadata)

**Multi-project:** `formatProjectsContextForAssistant(projects, options)` — caps at 5, prepends `=== Проект N ===` headers, identical formatter per project.

**Hard caps:** every long field is truncated with `…`; total per-project block is capped; multi-project is bounded.

## 3. Layer 2 — Financial Facts Block

**Source code:** `server/src/services/projectFinancialFacts.ts`

**Function:** `buildProjectFinancialFacts(projects, transcript, options)` returns either an empty string or a labelled block of `metric · value · [source]` lines.

**Triggered when** `detectFinancialQuestion(transcript)` matches any of:
- Revenue / profit / margin / EBITDA / payback / valuation
- CAC / LTV / MRR / ARR / GMV / ARPU / unit-economics
- Year tokens 2024–2032
- EN equivalents: revenue / profit / margin / valuation / payback / cap-table / burn-rate

**Sources used (in order):**

1. `Project.raiseAmount`, `equityOffered`, `minCheck` → tagged `[источник: карточка проекта]`
2. `InvestorTerms.*` → `[источник: условия инвестирования]`
3. `ProjectBrief.keyMetrics` JSON → `[источник: бриф / ключевые метрики]`
4. `ProjectBrief.napkin` JSON (finance-relevant keys only) → `[источник: бриф / бизнес на салфетке]`

**Period parsing:** keys like `net_profit_2027` or `revenue.2025` are auto-split into metric + period.

**Char budget:** 1 500 in full analyze, 800 in fast.

**Why deterministic:** AI shouldn't fish keyMetrics out of free-form prose. Fuzzy KB retrieval over an XLSX may miss `2027` (could be stored as `27 г.`). This block answers «какая чистая прибыль в 2027?» with the exact number from `keyMetrics.net_profit_2027` and labels its provenance.

## 4. Layer 3 — Project-Scoped Knowledge Base

**Source code:** `server/src/services/projectKnowledgeIngest.ts`

**Auto-ingestion on upload.** `server/src/routes/files.ts` POST `/api/files/:projectId/upload`:

```
After UploadedFile row is created:
  scheduleProjectFileIngest(uploadedFileId, projectId, { environment, createdById })
    fire-and-forget — does NOT block 201 response.
    Calls ingestProjectFileToKnowledge under the hood.
```

`ingestProjectFileToKnowledge`:
1. Loads UploadedFile, validates `projectId`.
2. Skips images, audio, external links, unsupported MIMEs.
3. Calls existing `ingestKnowledgeSource` with:
   - `scope: 'project'`, `projectId`
   - `sourceType`: XLSX or `category='financial'` → `financial_question`; PDF/DOCX/MD/TXT or `category in {pitch, description, reference}` → `project_presentation`; else `other`
   - `status: 'published'`, `visibility: 'internal'`, `isCandidate: false`
   - `originType: 'file_upload'`, `originId: uploadedFileId`
4. Parsing path: `fileParser.extractFromUploadedFile` → `chunkText` (existing pipeline) → KnowledgeChunk rows + FTS sync.

**Idempotency.** `ingestKnowledgeSource` deduplicates by sha256 of normalized text. Re-uploading the same PDF (different `UploadedFile.id`, same content) returns the existing source without creating extra chunks.

**Failure semantics.** Never throws upward. Logs `[project-kb] uploadedFileId=… status=…`. Failed ingestion does not break upload.

**Role visibility.** Founders never see raw snippets via `formatKnowledgeForPrompt` (role gate `canSeeRawSnippet` is admin/manager-only). Their prompt only shows the EVIDENCE label + summary. This is intentional — content of pitch-deck / financial-model is in retrieval scoring, not in founder UI.

## 5. Layer 4 — Global Sales KB

Unchanged from Sprint 38–60. Curated successful_sale / failed_sale / objection / follow_up / qualification cases live as `KnowledgeSource(scope='global')`. Auto-capture from sessions is still candidate-gated (admin must approve).

## 6. Retrieval flow

**Source code:** `server/src/services/knowledgeService.ts → retrieveKnowledgeForTranscript`

For each `/sales-assistant/analyze` call:

```
1. Extract top-40 keywords from transcript.
2. (Optional) FTS BM25 over KnowledgeChunkFts.
3. WHERE source.status='published', isCandidate=false, archivedAt=null,
         visibility ∈ visibilityFor(role),
         environment ∈ envFilter(workspaceStatus),
         scope ∈ {global} ∪ (projectId ? {project for THIS projectId} : ∅).
4. Hybrid score = 0.4·bm25Norm + 0.2·keywordOverlap, multiplied by:
     • qualityBoost  (verifiedAt → ×1.10; qualityScore≥70 → ×1.05)
     • projectBoost  (scope='project' → ×1.35  ← raised in Sprint 61 from 1.10)
     • typeBoost     (featureBoosts[sourceType])
     • financeBoost  (Sprint 61: when transcript has finance trigger,
                      financial_question → ×1.45,
                      project_presentation → ×1.20)
     • freshnessBoost (publishedAt within 30 days → ×1.05)
5. Threshold (full=0.06, fast=0.12), per-source-dedupe, per-type cap (2 full / 1 fast),
   top-result dominance break, topN (5 full / 2 fast).
```

**Project ⊳ global priority.** With `projectBoost = 1.35`, a project-scoped chunk needs only ~74% of a global chunk's raw hybrid score to win. With `financeBoost` stacked, a `financial_question` chunk at 1.45 needs ~50%. This is intentional: when the founder asks about their own numbers, the model should reach their finmodel first, not generic sales advice.

## 7. Prompt budget

| Block | Full analyze | Fast analyze |
|---|---|---|
| Structured project context | up to 4 000 chars per project × 5 = 20 000 (but practical ~600-1500/project) | up to 1 500 chars per project |
| Financial facts block | 1 500 (only if triggered) | 800 (only if triggered) |
| Sales KB block | 4 000 | 1 200 |
| Memory block | 600 | 600 |
| Recent context | last 6 000 chars of transcript | last 6 000 |
| Full transcript | up to 32 000 (route schema cap) | up to 32 000 |

Realistic full-analyze user prompt: ~12–18K chars in a typical mid-conversation. JSON response cap: `maxTokens=2400` full, `600` fast.

## 8. Source-discipline rules in the prompt

**Where:** end of user-prompt task list in `analyzeSalesTurn` and a compact one-liner in `analyzeSalesTurnFast`. NOT in the system prompt (which is admin-editable and could be wiped). The rules are inline so they survive any template change.

**Full version:**

```
ИСТОЧНИКИ ФАКТОВ (правила достоверности):
• Используй ТОЛЬКО факты из блоков «Контекст проекта», «Финансовые факты проекта»,
  «Релевантный опыт ZAPUSK» и transcript.
• НЕ выдумывай метрики проекта (выручку, прибыль, оценку, чек, доходность,
  EBITDA, окупаемость, CAC/LTV/MRR/ARR). Если точного числа нет — скажи
  «нужно уточнить по финмодели/брифу», а не подставляй удобное.
• При ссылке на цифру явно указывай источник: «по загруженной финмодели»,
  «по брифу проекта», «по условиям инвестирования», «по карточке проекта».
  Если факта нет — «не найдено в материалах, нужно уточнить».
• Project-факты ИМЕЮТ ПРИОРИТЕТ над generic-советами из sales KB. KB — это
  контекст-примеры, а не источник цифр конкретного проекта.
```

## 9. Idempotency and observability

**Upload → KB pipeline.** Each upload logs:
```
[project-kb] uploadedFileId=<id> project=<projectId> status=<status>
             sourceId=<sid> chunks=<N> dup=<0|1> durationMs=<ms> [reason=…]
```
Statuses: `ingested` / `duplicate` / `skipped_format` / `skipped_short` / `skipped_link` / `file_not_found` / `parse_failed` / `ingest_failed`.

**Sales-assistant analyze.** Existing telemetry unchanged:
```
[sales-assistant] mode=meeting prompt source=db templateId=… scriptKey=-
[sales-assistant] kb sources=N scanned=M
```

To verify a specific file made it into KB:
```sql
SELECT id, sourceType, scope, status, isCandidate
FROM KnowledgeSource
WHERE uploadedFileId = '<id>';

SELECT COUNT(*) FROM KnowledgeChunk WHERE sourceId = '<sid>';
```

## 10. Known limitations

1. **No embeddings.** Retrieval is BM25 + keyword. Russian morphology is partially handled by extracting 4+ char stems, but `выручка` vs `выручки` may score differently. Embeddings (Sprint 62+ candidate) would fix this.
2. **No table-aware extraction.** XLSX → `xlsx.sheet_to_csv` flattens cells into prose; numeric cells lose typing. Financial-model chunks therefore look like text, and the deterministic `buildProjectFinancialFacts` is the trustworthy path for specific numbers.
3. **PPT / images / scanned PDFs without OCR** are skipped. No fallback for ocr'less PDFs.
4. **External links** (Google Doc / Notion URLs) are not auto-fetched. They appear in the file list as `LINK` but their content does not enter KB.
5. **`keyMetrics` / `napkin` schemas are free-form JSON.** AI brief generator decides keys (`MRR`, `revenue_2026`, `unitEconomics.cac`). The formatter renders whatever is there; downstream `buildProjectFinancialFacts` parses `_<year>` suffix patterns but doesn't fight arbitrary nesting.
6. **One project file → one KnowledgeSource.** No per-sheet chunks for XLSX — a 12-tab financial model becomes one source with many chunks but no tab semantics.
7. **No background re-ingest on file replacement.** If a founder uploads a NEW finmodel version, both old and new live as separate KnowledgeSources. Soft-archive of UploadedFile does not cascade-archive the KB source (acceptable for now — admin can disable old source manually).
8. **Token budgets are not adaptive.** Very long contracts (>10 projects, >20 files) just get truncated. Acceptable until we see real demand.

## 11. Migration / rollout notes

- **No schema change.** Sprint 61 uses existing tables (`KnowledgeSource`, `KnowledgeChunk`, `UploadedFile`, `Project`, `ProjectBrief`, `InvestorTerms`).
- **Backfill optional.** Existing `UploadedFile` rows (uploaded before Sprint 61) are NOT auto-ingested by deploy. A separate one-shot CLI (TODO) can iterate them and call `ingestProjectFileToKnowledge`. New uploads ingest from the moment Sprint 61 lands.
- **Idempotency safe** to re-run any backfill — sha256-dedupe.

## 12. Testing

Run pure-formatter smoke:

```bash
npm run smoke:project-knowledge
```

Validates: finance-trigger detector, full/fast/empty formatter shapes, multi-project cap, financial-facts block contract, file-type → sourceType taxonomy. 47 assertions.

Existing transcript smokes unaffected and still pass:

```bash
npm run smoke:transcript
npm run replay
npm run regression:realcalls
```

## 13. Roadmap (NOT in Sprint 61)

- One-shot backfill CLI for legacy `UploadedFile` rows.
- Embedding-based retrieval for project-scoped chunks (project files are the highest-value target).
- Per-sheet chunking for XLSX so `Sheet: P&L 2027` becomes a retrievable boundary.
- KnowledgeSource auto-archive on UploadedFile soft-delete cascade.
- Cap-table parsing → structured `InvestorTerms.useOfFunds` enrichment.

## 14. See also

- `docs/transcript-architecture.md` — draft / clean / AI separation
- `docs/memory-layer.md` — NegotiationMemory specifics
- `docs/ai-assistant-architecture.md` — broader AI flow
- `server/src/services/projectContextFormatter.ts` — pure formatter
- `server/src/services/projectFinancialFacts.ts` — finance facts block
- `server/src/services/projectKnowledgeIngest.ts` — file → KB hook
- `server/src/services/knowledgeService.ts` — retrieval + boosts
- `server/src/services/salesAssistantService.ts` — prompt assembly
- `scripts/project-knowledge-smoke.ts` — formatter contract tests
