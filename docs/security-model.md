# Security model — Zapusk AI Packaging

> Last reviewed: Sprint 50, 2026-05-16. Pair this doc with [`rbac-matrix.md`](rbac-matrix.md), [`ai-provider-policy.md`](ai-provider-policy.md) and [`disaster-recovery.md`](disaster-recovery.md).

This is the public answer to "what protects user data here?" Investor / enterprise DD reviewers — start with [§1 Threat model](#1-threat-model) and [§4 Boundaries](#4-trust-boundaries).

---

## 1. Threat model

### 1.1 In scope

| Threat | Mitigation |
|---|---|
| Cross-tenant data leak (founder A reads founder B's projects, sessions, outcomes) | Per-request ownership predicates in [`accessPolicy.ts`](../server/src/lib/accessPolicy.ts); 404 (not 403) on miss so existence isn't leaked |
| Investor account reading founder data | `requireNotInvestor()` middleware blanket on every founder-facing route group |
| Silent AI fallback to mock in production | Sprint 49 hotfix 11 + 16: `aiProviderStatus()` + `/health.ai.warning` + `production_ai_provider_real` check in `/api/admin/security-scan` |
| AI cost runaway from compromised key or runaway client | Daily caps in [`ai/client.ts`](../server/src/ai/client.ts) (`AI_MAX_REQUESTS_PER_*`, `AI_MAX_COST_USD_PER_DAY`); per-actor rate limit on inference routes ([`lib/rateLimit.ts`](../server/src/lib/rateLimit.ts), Sprint 50 P0.2) |
| Replay-induced duplicates from double-click / retried fetch | Idempotency middleware ([`lib/idempotency.ts`](../server/src/lib/idempotency.ts), Sprint 50 P0.1); `IdempotencyKey` table with 24-hour TTL |
| Malicious file upload | MIME + extension allowlist ([`lib/uploadValidation.ts`](../server/src/lib/uploadValidation.ts), Sprint 50 P1.2); 50 MB / 60 MB size caps; uploads served only through authenticated download endpoint |
| Brute force on login / signup / demo-login | `auth` rate-limit bucket (10 burst, ~12/min sustained) |
| Session-token theft | JWT with 7-day TTL signed via `JWT_SECRET` (>=32 chars enforced at boot); secret-like values blocked from prompt templates |
| Demo-login privilege escalation in production | `ENABLE_DEMO_LOGIN=false` by default in prod, `DEMO_LOGIN_ALLOWED` derived from env, `/api/auth/demo` returns 403 |
| Public `/health` info disclosure | Sprint 50 P1.1 — `/health` minimal (ok / ts / env / ai.{provider, realProviderEnabled, warning}); detailed ops payload moved to `/api/admin/health/details` |
| Prompt injection through user-supplied transcripts / KB content | KB sanitization layer (Sprint 48 P1) strips role-spoof / hidden HTML / unicode override; KB snippets framed as `QUOTE` / `EVIDENCE` not instructions |

### 1.2 Out of scope (Sprint 50)

- DDoS at the network edge — Render's frontend handles SYN floods. We don't terminate raw TCP.
- Account takeover via compromised user device or browser — out of our control.
- AI provider compromise — we trust OpenAI / Anthropic key boundaries.
- Insider threat from SUPER_ADMIN — audit logs help retrospectively but there is no four-eyes principle in this MVP.
- WebRTC peer-to-peer media manipulation — OpenAI Realtime is the trust anchor.

### 1.3 Out of scope (current MVP, planned)

- Postgres migration — SQLite suits one-instance scale, but it pins the architecture to a single Render web. Sprint 51+.
- Per-organization tenant isolation — today a user = a tenant. Multi-user orgs are a Sprint 51+ concern.
- Manager-team-assignment access narrowing — currently MANAGER === ADMIN. See [`rbac-matrix.md`](rbac-matrix.md) §4.

---

## 2. Identity & authentication

- **Tokens.** Bearer JWT signed with `JWT_SECRET`. Payload: `{ sub, email, role, exp, iat, impersonatedBy? }`. Verified in `authMiddleware` on every `/api/*` route.
- **Password storage.** scrypt with random per-user salt — `authCrypto.ts`. No plaintext, no MD5, no SHA-without-salt.
- **Bootstrap accounts.** `seed.ts` upserts the 5 platform users (owner / admin / manager / demo-founder / demo-investor) on every boot; passwords come from `BOOTSTRAP_*_PASSWORD` env. If a password env is empty, the user is created without `passwordHash` (login disabled).
- **Demo-login lockdown.** `POST /api/auth/demo` returns 403 in production by default (`ENABLE_DEMO_LOGIN=false`). Re-enable per environment in Render dashboard for a public demo URL — never in production blueprint.
- **Header-auth lockdown.** Legacy `x-user-email` header auth returns 401 in production (`ENABLE_HEADER_AUTH=false`).
- **Smoke tokens.** `POST /api/admin/smoke-token` is SUPER_ADMIN-only, mints short-TTL JWTs for prod-smoke scripts. Token itself never written to audit.

---

## 3. Authorization

Single source of truth: [`server/src/lib/accessPolicy.ts`](../server/src/lib/accessPolicy.ts). Every route consults named predicates (`actorCanReadProject`, `actorCanReadSalesSession`, `actorCanReadAssistantOutcome`, etc.). The predicates encapsulate:

1. Admin-like roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`) see everything.
2. Founders see records they own — by `project.userId` for project-attached records, and by `record.createdById` for orphan records (Sprint 49 hotfix 10–12 introduced this for `SalesSession` and `ConversationAnalysis`).
3. INVESTOR is denied on every founder-facing router by the `requireNotInvestor()` middleware mounted at the router level.

Cross-tenant denial returns **404**, never 403 — this prevents an attacker from probing record existence.

See [`rbac-matrix.md`](rbac-matrix.md) for the full role × surface matrix.

---

## 4. Trust boundaries

```
Browser  ─────►  Render edge (TLS)  ─────►  Express  ─────►  SQLite (/var/data)
                                              │
                                              └────►  OpenAI / Anthropic / Deepgram / Lovable
```

| Boundary | Trusted? | Notes |
|---|---|---|
| Browser ↔ Render edge | Yes, encrypted TLS | Render certs auto-rotated |
| Render edge ↔ Express | Yes, same host | TLS terminates at edge; req.ip via X-Forwarded-For |
| Express ↔ SQLite | Yes, on disk | File on a Render persistent disk (`/var/data/prod.db`); not network-attached |
| Express ↔ OpenAI / Anthropic / Deepgram / Lovable | Trusted with secret | Keys in Render env, never logged, never returned to client. Idempotency: provider replays are best-effort, dedupe is on the client side |
| Browser ↔ OpenAI Realtime (WebRTC) | Yes, ephemeral | Sprint 49: `/api/realtime/transcription-session` mints a 60-second ephemeral client_secret — the long-lived `OPENAI_API_KEY` never reaches the browser |

---

## 5. Audit & observability

- **`AuditEvent` table.** Metadata-only writes (no PII payloads, no transcripts, no prompts). Captured on: invite create/revoke, user status change, file download/delete, sales-session read, conversation-analysis read, prompt template version publish, admin backup download, impersonation, smoke-token issuance, project archive, knowledge-source updates.
- **`AiRequestLedger`.** Per-AI-call row: feature, provider, model, latency, success/fallback/timeout, token/cost estimate. Sprint 48. **No prompts, no transcripts, no chunks, no raw AI output.**
- **`/api/ai-reliability/dashboard`.** Admin / manager view of AI health: request count, failure rate, fallback rate, p50/p95 latency, cost, circuit-breaker state.
- **`KnowledgeRetrievalEvent`** + `AssistantAdviceEvent` + `AssistantOutcomeEvent`. The full learning loop is observable — see [`/admin/learning`](../web/src/pages/AdminLearning.tsx).

---

## 6. Data at rest

- SQLite on Render persistent disk. Single file (`/var/data/prod.db`); uploaded user files in `/var/data/uploads/`.
- Encryption-at-rest: Render-provided disk encryption. **We do not encrypt the SQLite file at the application layer.** Sprint 51+ candidate once we move off SQLite.
- Backups: see [`disaster-recovery.md`](disaster-recovery.md). Hot backups via SQLite Online Backup API; pre-deploy snapshots automatic; off-site backup via `POST /api/admin/backup` (tar.gz).

---

## 7. Data in transit

- TLS only — Render redirects HTTP → HTTPS. CORS configurable via `CORS_ORIGIN`.
- WebRTC for realtime transcription uses DTLS-SRTP (browser-managed).
- AI provider calls (server-to-server) over HTTPS.

---

## 8. AI policy

See [`ai-provider-policy.md`](ai-provider-policy.md) for the full surface. Highlights:

- Production must run a real provider. Sprint 50 detects `AI_PROVIDER=mock` AND `provider != mock but key missing` as separate critical signals.
- Mock fallback in user-facing surfaces is honest: `fellBackToMock` rendered as "резервная подсказка / резервная карточка" with no claim of being real AI.
- Daily cost / request guardrails fail closed (AI throws `AIGuardrailError`; routes return 4xx with a specific code).

---

## 9. Outstanding risks

- **Single-tenant DB.** A SQLite corruption blast-radius = all customers. Backups + pre-deploy snapshots mitigate; long-term fix is Postgres + per-tenant schema or row-level security.
- **No 2FA.** Owner / admin / manager accounts are password-only. Acceptable for MVP; not for enterprise.
- **No formal pentest.** Internal threat model + Codex audits have informed each sprint, but a third-party assessment is on the roadmap before public launch.
- **Idempotency table cleanup.** Sprint 50 P0.1 ships the table + middleware; no scheduled job purges expired rows yet. Today they expire logically (24h check on read) but accumulate on disk. Sprint 51 candidate.
