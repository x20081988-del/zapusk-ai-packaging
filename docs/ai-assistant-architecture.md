# AI Assistant Architecture

> Status: Sprint 53 baseline (post `9551d97`).

## Two desk modes

The AI Assistant page (`web/src/pages/SalesAssistant.tsx`) ships with two distinct work modes selected by the user via a tab switcher:

| Desk mode | Audience | Purpose | Time horizon |
|---|---|---|---|
| **Meeting** (default) | Founder / sales lead / investment manager | Full investor meeting with live transcription, advice on every turn, finalize-into-memory | 30–60 min |
| **Qualification** | First-touch outbound managers | Short qualifying call from a lead list. Goal — book the Zoom with an expert and capture chequebook / timeline / criteria | 5–10 min |

State machine:

```
deskMode:     meeting | qualification     (user choice; persists across stop/start)
sessionState: idle → starting → listening → stopped → completed | error
```

`deskMode` is independent of `sessionState`; pressing Stop does NOT reset desk choice (`Sprint 51 hotfix P0.2`).

## Live transcription path

```
[Browser mic]
   └─→ getUserMedia → RTCPeerConnection
        └─→ POST /api/realtime/transcription-session (ephemeral client_secret)
             └─→ https://api.openai.com/v1/realtime/calls   (WebRTC)
                  ▲                                          ▼
                  └─ DataChannel events (interim + completed transcripts)
```

Primary: **OpenAI Realtime** with model `gpt-4o-transcribe` and the `realtime_transcription` template body as dictionary prompt.

Fallback: Web Speech API (`webkitSpeechRecognition`) if backend has no key, browser blocks WebRTC, or the realtime channel errors. The fallback is silent — user sees a single "слушаю встречу/звонок" badge regardless of which engine actually drives the transcript.

Deepgram is NOT used for live transcription. It only acts as a fallback for **uploaded audio files** in `conversationAnalysisService` if the OpenAI key is missing.

## Advice pipelines (two-phase)

Each click of "Получить подсказку" fires **two independent requests in parallel**:

1. **Fast** — `POST /api/sales-assistant/analyze-fast` (~1–3 sec). Returns `mainQuestion + backupQuestions + selfSaleQuestions + spinStage`. Renders immediately.
2. **Full** — `POST /api/sales-assistant/analyze` (~5–15 sec). Returns full structured card with emotional layer, risks, tone guidance, etc. Merges via "fastLock" pattern: actionable fields keep the fast values; analytics fields come from full.

Stale-discard via separate refs (`fastRequestIdRef`, `fullRequestIdRef`). A second click before either lands cancels the first via its own `AbortController` so old responses can never overwrite new advice.

## Memory injection (Sprint 52 P0.6)

When `analyze` runs, the service calls `getRecentMemories({ investorName, projectId, limit: 3 })` and prepends a compact block to the user prompt:

```
Память предыдущих контактов:
• 2026-05-10 · итог=followup
  кратко: investor liked div model, asked about exit at year 3
  возражения: «подумаю про чек», «не люблю iliquid»
```

Char budget 600; cap at 3 entries; gracefully empty on cold start. No embeddings or vector DB — pure relational lookup by `investorName` (exact match) and `primaryProjectId`.

## Multi-project context (Sprint 52 P0.4)

Frontend exposes `projectId` (primary) and `relatedProjectIds[]` (chips). Backend accepts `projectIds: string[]` (max 5) and renders each project context in the prompt under `=== Проект N ===` markers. AI can switch focus mid-call between, e.g., DLFY vs ГлавСнаб, or compare two offers.

## Negotiation Memory layer (Sprint 52 P0.2)

Every finalize creates a `NegotiationMemory` row:

```
NegotiationMemory {
  salesSessionId, primaryProjectId, projectIds[],
  investorName, investorPhone,
  transcript (cap 16k), summary, outcome,
  objections[], tags[], speakerInsights, managerNotes,
  createdById, createdAt
}
```

Auto-created fire-and-forget after `persistSession`. Used by P0.6 memory injection above. Foundation for future:
- RAG / vector search (add `embedding BLOB` column)
- Training dataset export (`listMemoriesByOutcome()` already returns grouped arrays)
- Investor-360 view (group by investorName, aggregate timeline)

## Qualification scripts (admin-driven)

7 named scripts seed `qualification.<key>` PromptTemplate rows:
- `dlfy_vamlyam`, `dlfy_base`, `glavsnab`, `zapusk_base`, `zapusk_after_vamlyam`, `funnel_return`, `generic`

Backend service `resolveQualificationScriptBody(scriptKey)` looks up DB first (admin edits without redeploy); falls back to `formatQualificationContextBlock()` from the hardcoded catalog. Frontend selector fetches metadata from `GET /api/sales-assistant/qualification-scripts` (not admin-protected) and falls back to a hardcoded catalog if the API fails.

## Outcome dataset (Sprint 52 P0.3)

After finalize, the success modal includes an inline `<OutcomeForm>`. Manager classifies: `success | failed | followup | unknown` + optional `managerOutcomeNotes`. Saved via `PATCH /api/sales-sessions/:id/outcome`.

Mirrors into `NegotiationMemory.outcome` for retrieval grouping. This is the seed data for future training pipelines — successful Zoom-closes vs failed calls become labeled datasets.

## Critical product rule — methodology not in UI

Internal sales framework (SPIN, self-sale, С/П/У/Р stage letters) is **NEVER** visible to end users. This is the moat. Internal enum values stay (`spinStage: 'S' | 'P' | 'I' | 'N'` is part of the AI JSON contract) but every UI label uses human language:

- Stage badge: «Этап · Понимаем контекст / Выявляем задачу / Уточняем важность / Переходим к решению»
- "Self-sale" block heading: «Вопросы для раскрытия интереса»
- Stage map: 1 / 2 / 3 / 4 (numeric with human tooltip), never С/П/У/Р

The system prompt explicitly forbids the AI from echoing methodology terms in user-visible fields (Sprint 53 Task A).

Admin-only pages (`AdminLearning`) can still surface the internal funnel for analytics — those views are SUPER_ADMIN-only and not user-facing.

## Mobile (Sprint 52 P0.5 + Sprint 53 Task G)

- Sticky bottom action bar (`sm:hidden`) with Start/Stop + Hint
- Desk tabs shrink to "Встреча" / "Квалификация" at `<sm`
- Textarea height `h-[40vh] sm:h-[55vh]` — avoids huge editor pushing Save below fold
- Transcript area `h-[45vh] sm:h-[60vh]` — same reasoning
- `safe-area-inset-bottom` for iPhone home bar

## Key files

| Concern | File |
|---|---|
| Page UI | `web/src/pages/SalesAssistant.tsx` |
| Live transcription | `web/src/lib/realtimeTranscription.ts` |
| Ephemeral token route | `server/src/routes/realtime.ts` |
| Advice analyze routes | `server/src/routes/salesAssistant.ts` |
| Advice service | `server/src/services/salesAssistantService.ts` |
| Negotiation memory | `server/src/services/negotiationMemoryService.ts` |
| Qualification scripts | `server/src/ai/qualificationPrompts.ts` |
| Sales session finalize | `server/src/services/salesSessionService.ts`, `server/src/routes/salesSessions.ts` |
| Sales system prompt | `server/src/ai/salesAssistantPrompt.ts` |
