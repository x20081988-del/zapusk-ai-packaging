# Transcript Architecture — Draft / Clean / AI Layer

> Status: Sprint 60 baseline.
>
> Definition of the production truth principle:
> **Realtime is UX. Offline is truth. AI analysis happens after.**

This document explains how Zapusk AI separates three transcript concerns:

1. **realtime_draft** — what the live realtime API produces during a call. Disposable. Used only for live hints.
2. **offline_clean** — what `gpt-4o-transcribe` produces on the recorded audio. Canonical. Persisted. Immutable once written.
3. **ai_analysis_source** — derived AI artifacts (summary, objections, memory). Always regenerated from `offline_clean` once available.

## Why two transcripts

Realtime transcription is great UX (sub-second latency) but has known failure modes:
- **Paraphrasing** — model rewrites under prompt bias (Sprint 56 «Здравствуйте → Друзья»)
- **Hallucination** — model fills silence with plausible phrases (Sprint 51 «Чек или доля?»)
- **VAD chopping** — silence threshold splits one phrase into multiple segments
- **Filler stripping** — model «cleans up» ага / угу / эээ that the AI layer needs as hesitation signal

Offline `gpt-4o-transcribe` on the recorded buffer produces a much higher-fidelity transcript because:
- It sees the entire utterance, not a streaming window
- It applies the same prompt without time pressure
- Cleaner audio is easier to disambiguate

Both paths use the **same** template body (Sprint 57 strict-verbatim prompt). No prompt drift.

## Data model (Sprint 60 baseline)

```
SalesSession {
  // Sprint 54 P0 — Hybrid transcription identity:
  transcript               : authoritative text shown to user / used by AI
  transcriptSource         : 'realtime_draft' | 'offline_clean' | 'uploaded_audio' | 'manual'
  transcriptQualityStatus  : 'draft' | 'clean' | 'failed' | 'not_available'
  audioStoragePath         : storage path to original audio (if recorded)

  // Sprint 55 P0 — Recompute provenance:
  draftTranscript            : preserved original realtime text (set when clean replaces)
  aiDerivedFrom              : 'draft' | 'clean' — which transcript drove summary/objections
  cleanTranscriptProcessedAt : timestamp of successful recompute (idempotency guard)

  // Sprint 60 P0 — Reliability + escalation + immutability:
  realtimeReliabilityScore  : 0..100 composite (from RealtimeQualityScore)
  requiresManualReview      : auto-flagged when realtime degraded critically
  transcriptFrozenAt        : timestamp of clean transcript freeze. Once set,
                              `transcript` field is canonical and protected
                              by persistCleanTranscript immutability guard.
}

NegotiationMemory {
  sourceTranscriptQuality : 'draft' | 'clean' — provenance for memory entry
}
```

## Lifecycle of a session

```
1. FINALIZE
   POST /api/sales-sessions/complete
     → SalesSession row created
     → transcript = realtime draft
     → transcriptSource = 'realtime_draft'
     → transcriptQualityStatus = 'draft'
     → aiDerivedFrom = 'draft'
     → NegotiationMemory created (sourceTranscriptQuality='draft')
     → AI summary/objections derived from DRAFT (best-effort, may have hallucinations)
   ↓
2. AUDIO UPLOAD (if MediaRecorder recorded the call)
   POST /api/sales-sessions/:id/audio (multipart)
     → audio persisted to /var/data/sales-audio/
     → audioStoragePath set
     → runCleanTranscription() → gpt-4o-transcribe → normalize
     → if clean text produced:
         • SAVE original transcript → draftTranscript (idempotent)
         • OVERWRITE transcript with clean text
         • transcriptSource = 'offline_clean'
         • transcriptQualityStatus = 'clean'
         • transcriptFrozenAt = now()  ← IMMUTABILITY LOCK
   ↓
3. AUTO RECOMPUTE
   recomputeFromCleanTranscript(sessionId)  (fired by audio upload endpoint)
     → idempotency check: if aiDerivedFrom='clean' && cleanTranscriptProcessedAt → skip
     → run completeSession() on clean text → fresh AI summary/objections/etc.
     → compute diff(draftTranscript, transcript) → realtimeQualityScore + filler + escalation
     → UPDATE SalesSession:
         • all AI fields replaced from clean
         • aiDerivedFrom = 'clean'
         • cleanTranscriptProcessedAt = now()
         • realtimeReliabilityScore = score (0..100)
         • requiresManualReview = true if score<50 || hallucinations>3 || phrasePreservation<0.6
     → UPSERT NegotiationMemory:
         • findFirst by salesSessionId → update in place (no duplicates)
         • sourceTranscriptQuality = 'clean'
   ↓
4. (optional) MANUAL RECOMPUTE
   POST /api/sales-sessions/:id/recompute
     → ?force=1 (admin only) clears idempotency guard → reruns AI
     → transcript content itself UNCHANGED (immutability holds)
```

## Authority hierarchy

| Operation | Source |
|---|---|
| Live hints (during call) | realtime_draft |
| `analyze` / `analyze-fast` (during call) | realtime_draft |
| Persisted summary, objections, risks | clean (if exists) → otherwise draft |
| NegotiationMemory record (auto-saved on finalize) | clean (after recompute) → otherwise draft |
| Outcome analytics | clean |
| Training datasets / fine-tuning | clean ONLY |
| Investor profile | clean |
| Stage classification | clean |

In practice: **anything that gets persisted for >24 hours** comes from the clean transcript.

## Immutability guard

Once `transcriptFrozenAt` is set on a row, `persistCleanTranscript()` refuses to overwrite the transcript field. The only legitimate way to mutate the transcript content again is:

1. Admin SQL (out-of-band, intentional).
2. Explicit re-transcription via dev workflow (TODO).

This protects the canonical source from accidental double-uploads or background-task races.

## QA observability

Every transcript-quality decision is observable:

- `GET /api/sales-sessions/:id/transcript-diff` — JSON with similarity, mutation ratio, hallucination candidates, RealtimeReliabilityScore + class, filler preservation rate, manual review reason
- Console logs (per session):
  - `[transcription/raw_received]` ... `[transcription/appended]` — segment lifecycle
  - `[audio/input-config]`, `[audio/quality-aggregate]` — input fidelity
  - `[transcription/interim-final-mutation]` — when realtime rewrites itself mid-segment
  - `[recompute] session=… status=… hallucinations=…` — recompute outcome
- Session row:
  - `realtimeReliabilityScore` (0..100) → quick gating signal
  - `requiresManualReview` (bool) → QA queue
  - `aiDerivedFrom`, `cleanTranscriptProcessedAt` → provenance

## RealtimeReliabilityScore formula

```
score = 100 * (
    0.4 * similarity                          // overall token overlap
  + 0.3 * phrasePreservationRate              // sentence-level survival
  + 0.3 * tokenSurvivalRate                   // token-level survival
  - 0.1 * (hallucinationCount > 0 ? 1 : 0)    // any hallucination → 10pt penalty
)
```

Clamped to `[0, 100]`. Classes:
- `excellent` ≥ 90
- `good` ≥ 75
- `mediocre` ≥ 50
- `poor` < 50

Auto-escalation triggers `requiresManualReview = true` when ANY:
- `score < 50`
- `hallucinationCount > 3`
- `phrasePreservationRate < 0.6`

## Event-sourcing foundation (Sprint 60 P0.9)

Current architecture is "snapshot" — the transcript field is overwritten when clean lands. We retain the previous version via `draftTranscript`. This is enough for the audit needs of Sprint 60.

For future fully event-sourced pipeline:

```
Plan (NOT IMPLEMENTED):
─────────────────────────
Replace overwrite semantics with append-only events:

TranscriptEvent {
  sessionId
  segmentId
  source              : 'realtime' | 'offline' | 'manual_edit'
  text                : segment content
  ts                  : when emitted
  supersedes          : optional pointer to previous segment id this corrects
}

Reads project the latest authoritative segments per range. Writes append.
Diff between source='realtime' and source='offline' = current draft-vs-clean
view. Future re-transcriptions (new model release) append source='offline_v2'.

Benefits:
  • Full audit trail; nothing ever lost
  • Multiple analysis runs (e.g., gpt-5-transcribe vs gpt-4o) coexist
  • Manual edits become first-class data (operator corrects a misheard name)
  • Easier multi-language support — one event stream per language overlay

Cost:
  • Need projection layer to compute "current transcript" view
  • Storage grows linearly with edits (mitigation: cap retention to 1 year)
  • Migration from current snapshot model requires backfill

Foundation already in place:
  • Lifecycle tracker (web/src/lib/transcriptPipeline.ts) — segment IDs assigned at raw_received
  • SalesSession.draftTranscript — preserved version 1
  • SalesSession.aiDerivedFrom — provenance flag
  • Recompute pipeline — pure-functional regeneration from any source

Steps to actually implement (future sprint, not P0):
  1. Add TranscriptEvent table (append-only, indexed by sessionId + ts).
  2. Refactor persistCleanTranscript to APPEND a new event (source='offline_clean')
     instead of overwriting SalesSession.transcript. Keep transcript field
     as cached projection.
  3. Add projection job that recomputes SalesSession.transcript when new
     events land (debounced).
  4. Migrate existing rows: emit one TranscriptEvent per existing
     transcript/draftTranscript pair.
  5. Manual editing: surface in admin UI; appends source='manual_edit'.
```

## See also

- `docs/ai-assistant-architecture.md` — broader AI assistant context
- `docs/memory-layer.md` — NegotiationMemory specifics
- `scripts/transcript-aggregation-smoke.mjs` — aggregation contract tests
- `scripts/pipeline-replay.mjs` — deterministic pipeline replay
- `scripts/real-call-regression.mjs` — real-call regression baseline
