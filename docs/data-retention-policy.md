# Data retention policy — Zapusk AI Packaging

> **Status: draft. Sprint 50, 2026-05-16.** This document captures the intent; the cleanup jobs that enforce it are Sprint 51+ work.

## 1. What we store

| Data class | Storage | Sensitivity |
|---|---|---|
| User accounts (email, name, password hash) | `User` table, SQLite | High |
| Projects, briefs, generated artefacts | `Project`, `ProjectBrief`, `GeneratedPrompt`, `GeneratedDocument` | High — investor-grade |
| Uploaded files | `/var/data/uploads/`, `UploadedFile` row | High |
| Sales meetings | `SalesSession` (incl. full transcript, AI summary) | Very high — investor conversation |
| Conversation analyses | `ConversationAnalysis` (incl. full transcript) | Very high |
| Knowledge base | `KnowledgeSource` + `KnowledgeChunk` (+ FTS5 mirror) | Medium |
| AI request ledger | `AiRequestLedger` — metadata only, no payloads | Low |
| Audit events | `AuditEvent` — metadata only, no payloads | Low |
| Idempotency keys | `IdempotencyKey` — opaque key + response snapshot | Medium (snapshot may contain DB IDs) |
| Pre-deploy DB snapshots | `/var/data/snapshots/prod-*.db`, last 7 | Mirror of everything above |
| Hot backup files | `/var/data/prod.backup-*.db` (on demand) | Mirror of everything above |

## 2. Retention windows (target)

| Data class | Live window | Soft-deleted window | Hard delete |
|---|---|---|---|
| `SalesSession` | indefinite | `archivedAt` until 90 days, then purge | Sprint 51 cleanup job |
| `ConversationAnalysis` | indefinite | `archivedAt` until 90 days, then purge | Sprint 51 cleanup job |
| `AssistantOutcomeEvent` | indefinite | `archivedAt` until 90 days, then purge | Sprint 51 cleanup job |
| `AiRequestLedger` | 90 days rolling | n/a | Sprint 51 cleanup job |
| `AuditEvent` | 18 months rolling | n/a | Sprint 51 cleanup job |
| `KnowledgeRetrievalEvent` | 12 months rolling | n/a | Sprint 51 cleanup job |
| `AssistantAdviceEvent` | 12 months rolling | n/a | Sprint 51 cleanup job |
| `IdempotencyKey` | 24 hours (`expiresAt`) | n/a | Sprint 51 sweep job |
| `PromptTemplateVersion` | 24 months append-only | n/a | manual super-admin only |
| `UploadedFile` | indefinite while project not archived | 30 days post-archive | Sprint 51 cleanup job |
| Pre-deploy DB snapshots | 7 most recent | n/a | Auto (already implemented) |
| Hot backup files | manual | n/a | Operator deletes |

## 3. Soft delete & user erasure

All user-touched models have `archivedAt`. Setting it hides the row from list endpoints and the unique constraint checks. User-data deletion request:

1. SUPER_ADMIN sets `User.archivedAt`.
2. Cascade: project rows become orphan via FK `ON DELETE SET NULL`; existing soft-delete fields preserve audit linkage but hide from UIs.
3. Hard delete: out of scope for MVP. Tracked here so a future GDPR-style erasure path knows the surface area.

## 4. Backups & restore

See [`disaster-recovery.md`](disaster-recovery.md). Backup contents necessarily mirror the live DB's retention state — if a row was already soft-deleted at backup time it remains soft-deleted in the backup.

## 5. PII in logs

Server logs (Render console + `AuditEvent` payloads) intentionally exclude:

- Transcript content.
- Investor names from prompt/AI inputs.
- AI input text (`AiRequestLedger` records only `charsIn/charsOut`).
- Idempotency response bodies (stored in DB, not logged).
- API keys (env-only, never echoed).

Per Sprint 37 audit hardening, every read of a `ConversationAnalysis` or `SalesSession` writes a metadata-only `AuditEvent` (`projectId`, `investorName`, `probabilityScore`, `tone`) — never the transcript or summary.

## 6. AI provider data flow

Outbound text leaving the platform (prompt to OpenAI / Anthropic):
- Project brief content + materials.
- Sales transcript (live and uploaded).
- Conversation analysis transcript.
- Knowledge-base snippets used in RAG context.

Inbound text returning from the AI provider:
- Structured JSON answers (sales advice card, brief, packaging materials, meeting summary).
- These are stored in their respective DB tables.

We do **not** opt user data into provider training. OpenAI's API is configured against a project key under default no-training policy as of 2024 (verify per OpenAI org settings).

## 7. Outstanding cleanup jobs (Sprint 51+)

The retention windows in §2 are the contract. The jobs that enforce them are not yet implemented. Concretely needed:

```ts
// scripts/cleanup.ts (sketch)
async function purgeIdempotencyKeys() {
  await prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
async function purgeArchivedSessions() {
  const cutoff = new Date(Date.now() - 90 * 86400_000);
  await prisma.salesSession.deleteMany({ where: { archivedAt: { lt: cutoff } } });
}
// … similarly for outcomes, conversation analyses, advice events, ledger, audit
```

Schedule: nightly Render cron job (or single-process loop on server start). Each job emits an `AuditEvent` so the deletion is itself auditable.

## 8. User-visible export

Out of scope for Sprint 50. Tracked as a Sprint 51+ candidate: "export everything related to this user as a tar.gz", aligning with GDPR Article 20 (right to data portability) even before formal compliance.
