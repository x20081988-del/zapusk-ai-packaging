# AI provider policy — Zapusk AI Packaging

> Sprint 50, 2026-05-16. Authoritative implementation: [`server/src/ai/client.ts`](../server/src/ai/client.ts) + [`server/src/env.ts`](../server/src/env.ts).

## 1. What the platform calls

| Provider | Used for | Auth | Failure mode |
|---|---|---|---|
| OpenAI | Sales-assistant analyze (fast + full), conversation analysis, brief, packaging prompts, investor FAQ, AI discoverability report, realtime transcription, gpt-4o-transcribe for audio files | `OPENAI_API_KEY` (server env) | Falls through to mock; logged in `AiRequestLedger` |
| Anthropic | Financial model, calculator spec, brief regenerate | `ANTHROPIC_API_KEY` (server env) | Same |
| Deepgram | Conversation analysis audio (legacy fallback after OpenAI gpt-4o-transcribe) | `DEEPGRAM_API_KEY` (server env) | Falls through to deterministic mock transcript |
| Lovable | Landing / one-pager / pitch deck web | `LOVABLE_API_KEY` (server env) | Falls through to mock preview URL |

The AI client picks the provider via `AI_PROVIDER` env (`openai` / `anthropic` / `mock`). Per-feature routing in [`ai/client.ts`](../server/src/ai/client.ts) overrides this for features like financial which always want Claude.

## 2. Production policy

### 2.1 Mock is forbidden in production

`AI_PROVIDER=mock` in production is treated as a **critical** misconfiguration. The platform won't proactively refuse to start (we never want to take prod down by accident), but every diagnostic surface flags it:

| Surface | Output |
|---|---|
| `/health.ai.warning` | `production_ai_provider_is_mock` |
| `/health.ai.warningSeverity` | `critical` |
| `/health.ai.realProviderEnabled` | `false` |
| `/api/admin/security-scan` | check `production_ai_provider_real` → `critical` |
| Startup log | `[startup] AI provider warning: production_ai_provider_is_mock` |
| `scripts/prod-smoke-auth.ts` | First check fails with `CRITICAL: production AI provider is not openai` |

### 2.2 Provider with empty key is also forbidden

Equally bad: `AI_PROVIDER=openai` with `OPENAI_API_KEY=""` — every call silently falls to mock. Sprint 49 hotfix 16 made this distinct:

| Surface | Output |
|---|---|
| `/health.ai.warning` | `production_ai_provider_key_missing` |
| `/health.ai.warningSeverity` | `critical` |
| `/health.ai.realProviderEnabled` | `false` |

### 2.3 Sanctioned mock exception — public demo URL

If you're running a **public demo** Render service that should serve mock responses (no real AI bill), set both:

```
AI_PROVIDER=mock
ALLOW_MOCK_AI_IN_PRODUCTION=true
```

The warning then becomes `production_ai_provider_is_mock_explicit_override` with severity `warning` (not `critical`). The smoke script still flags it as not-real, which is correct — a demo URL is not production.

### 2.4 Optional fail-fast

Set `ENFORCE_REAL_AI_PROVIDER=true` to make the container `process.exit(1)` on boot if either critical case is detected. **OFF by default** so flipping an unrelated env in a panic doesn't crash prod.

## 3. Cost & rate controls

### 3.1 Daily caps (server-side fail-closed)

| Env | Default | Purpose |
|---|---|---|
| `AI_MAX_REQUESTS_PER_USER_PER_DAY` | 500 | One user can't drain the org's quota |
| `AI_MAX_REQUESTS_PER_PROJECT_PER_DAY` | 2 000 | One runaway project loop can't drain the day |
| `AI_MAX_COST_USD_PER_DAY` | 50 | Hard cost ceiling across all calls |
| `AI_MAX_TIMEOUT_MS` | 30 000 | Per-feature ceiling on individual AI request duration |

Counted from `AiRequestLedger`. When a cap is hit, the AI client throws `AIGuardrailError(code, statusCode)`. Every AI-calling route catches this and surfaces the code to the client; the SalesAssistant UI maps it to specific copy ("Дневной лимит AI-затрат исчерпан...").

### 3.2 Per-route rate limits (Sprint 50 P0.2)

In-memory token bucket per route group:

| Group | Routes | Capacity | Refill |
|---|---|---|---|
| `auth` | login, signup, demo | 10 | 0.2/s |
| `ai_inference` | sales-assistant analyze, conversation-analysis text | 30 | 0.5/s |
| `realtime_token` | realtime/transcription-session | 10 | 0.2/s |
| `file_upload` | conversation-analysis multipart | 6 | 0.1/s |

Keyed by actor when authed, by IP when not. Returns 429 with `Retry-After`.

### 3.3 Provider circuit breaker

Tracked in [`ai/client.ts`](../server/src/ai/client.ts) as `breakerState`. High error rate or repeated timeouts mark a provider as degraded for a cooldown window; new calls fall straight through to mock without paying the round trip. The breaker is in-memory only — resets on container restart.

## 4. Mock fallback honesty

When the AI client returns mock output (no key, provider degraded, daily cap hit, parser failed), the result carries `fellBackToMock: true` and `provider: 'mock'`. Sprint 49 hotfix 9 + 13 made `mockJsonForFeature()` emit the right JSON shape per feature so the parser never silently produces a "generic SPIN" answer that looks real. Sprint 50 P1.3 added `fellBackToMock` rendering on `MeetingCard`. Every surface that consumes AI output:

| Surface | Mock indicator |
|---|---|
| SalesAssistant | "резервная подсказка" status badge + "AI временно отвечает резервной формой" copy in mock card |
| ConversationAnalysis | `MockModeNotice` banner |
| Meetings list / detail (MeetingCard) | "резервная карточка (AI недоступен)" badge |
| Admin AI Reliability | `fallbackUsed` column in ledger |

## 5. Observability

`AiRequestLedger`: every call. **Metadata only — no prompt text, no response text, no transcripts.** Fields: feature, provider, model, requestType, actorId, projectId, success/fallback/timeout, latency, input/output/total token counts, estimated cost USD, char counts.

Use `/api/ai-reliability/dashboard` to see aggregates. SUPER_ADMIN / ADMIN / MANAGER.

## 6. Prompts as data

Prompt templates live in DB (`PromptTemplate`) with append-only versions (`PromptTemplateVersion`). Edited via admin UI; protected by:

- `assertNoPromptSecrets()` — blocks `sk-...`, `xoxb-...`, JWT-shaped tokens.
- Append-only history. Bad template version → super-admin restores prior via UI.
- KB-injected snippets are wrapped as `QUOTE` / `EVIDENCE` — never treated as instructions (Sprint 48 prompt-injection hardening).

## 7. Data retention (AI artefacts)

See [`data-retention-policy.md`](data-retention-policy.md) (draft).

## 8. AI-provider override flow

```
                  ┌─────────────────────────────────┐
                  │ Render dashboard env knob       │
                  │   AI_PROVIDER=openai            │
                  │   OPENAI_API_KEY=sk-…           │
                  └──────────────┬──────────────────┘
                                 │
                                 ▼
                  ┌─────────────────────────────────┐
                  │ render.yaml blueprint default   │
                  │   AI_PROVIDER=openai (P0.1)     │
                  └──────────────┬──────────────────┘
                                 │
                                 ▼
                  ┌─────────────────────────────────┐
                  │ env.ts aiProviderStatus()       │
                  │   surfaces warning              │
                  │   /health.ai.warning            │
                  └─────────────────────────────────┘
```

The Sprint 49 incident — `AI_PROVIDER=mock` shipped in `render.yaml` as the default, dashboard override was reverted by a Blueprint sync — is now caught by both the diagnostic surface and (optionally) the `ENFORCE_REAL_AI_PROVIDER=true` fail-fast.
