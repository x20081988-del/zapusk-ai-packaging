# Negotiation Memory Layer

> Sprint 52 P0.2 foundation. No embeddings yet — pure relational store + keyword retrieval.

## Model

```prisma
model NegotiationMemory {
  id              String   @id @default(cuid())
  salesSessionId  String?       // null if standalone, else FK SET NULL
  primaryProjectId String?      // main project of this call
  projectIds      String        // JSON string[] — all projects mentioned
  investorName    String?
  investorPhone   String?
  transcript      String        // cap 16k chars (tail-preserving)
  summary         String?
  outcome         String?       // 'success' | 'failed' | 'followup' | 'unknown'
  objections      String        // JSON string[]
  tags            String        // JSON string[]
  speakerInsights String?       // freeform Russian
  managerNotes    String?
  createdById     String?
  createdAt       DateTime @default(now())

  @@index([investorName])
  @@index([primaryProjectId])
  @@index([createdById])
  @@index([createdAt])
  @@index([outcome])
}
```

Migration: `server/prisma/migrations/20260517100000_sprint52_outcome_and_memory/`.

## When entries are created

Every successful `POST /api/sales-sessions/complete` call. Fire-and-forget after `persistSession`:

```ts
createNegotiationMemory({
  salesSessionId, primaryProjectId, projectIds,
  investorName, investorPhone,
  transcript, summary, outcome,
  objections: summary.objections,
  tags: [],
  speakerInsights: null,
  managerNotes: input.managerOutcomeNotes,
  createdById,
})
```

Failure does NOT block the response. Sales session still saves; memory just doesn't get a row that turn.

## Retrieval API

### `getRecentMemories({ investorName, projectId, outcome, limit })`

Returns up to `limit` (1–20, default 5) most recent entries matching ANY filter. Used by `buildMemoryBlock()` in `salesAssistantService` to inject context into AI prompts.

Match semantics today: **exact** on investorName and primaryProjectId. SQLite has no native ILIKE; Prisma's `mode: 'insensitive'` isn't supported on SQLite. To improve recall when investors get mistyped, future Sprint 53 P2 work should add normalized-name index or move to embeddings.

### `listMemoriesByOutcome(limit)`

Returns `{ success: [], failed: [], followup: [] }` arrays for dataset export. Foundation for future fine-tuning pipeline (Sprint 53 P2 #10).

## How AI uses memory

`buildMemoryBlock(input)` in `salesAssistantService.ts`:

1. If neither `investorName` nor `projectId` present → return `[]` (no block).
2. Else call `getRecentMemories` with limit=3.
3. Format each entry into a compact bullet:

```
Память предыдущих контактов (используй для контекста, не цитируй дословно):
• 2026-05-10 · итог=followup
  кратко: investor liked div model, asked about exit at year 3
  возражения: «подумаю про чек»; «не люблю iliquid»
  про инвестора: чувствителен к word "акции", сильнее реагирует на "дивиденды"
```

Char budget 600. If an entry would push past budget, it's skipped (rest go into the omit-tail).

Block is prepended to user prompt **before** `Контекст проекта`. AI is instructed to use as context without citing verbatim.

## Privacy / retention notes

- `transcript` is stored truncated (16k char tail-preserving cap). Full transcripts already live on `SalesSession.transcript`; memory acts as a query-friendly digest.
- `investorPhone` mirrors `SalesSession.investorPhone`. Same RBAC: investor can't list memories. Founder sees own. Admin/manager sees all.
- No PII redaction yet. If GDPR-style "delete me" hits, cascade is `salesSession.delete → memory.salesSessionId=NULL`; manual cleanup of orphaned rows is admin task.
- No vector embeddings → no inference-time vendor lock-in.

## Future-proofing decisions

| Decision | Rationale |
|---|---|
| JSON strings for arrays | SQLite has no array type; `JSON.stringify` on write + `safeJsonArray` on read keeps schema portable. |
| `outcome` not enum-constrained at DB level | Schema-flexible; service layer validates against `SessionOutcome` type. Allows future outcomes like `'long_followup'` without migration. |
| `salesSessionId` nullable + `ON DELETE SET NULL` | Memories can survive session deletion (useful for export). |
| Cap transcript at 16k chars | Balances retrieval signal vs storage; full transcript still on SalesSession. |
| No embedding column yet | Spec P0.8 forbids until later sprint. Adding column without computing fill is cheap when needed. |

## Operational logs

`salesAssistantService` currently does NOT log when memory injection fires/skips. Sprint 53 backlog item P1.5 — add lightweight observability:
```
[sales-assistant/memory] count=2 investorName=Sergey projectId=cuid1
[sales-assistant/memory] count=0 investorName=null projectId=null   // skipped
```
