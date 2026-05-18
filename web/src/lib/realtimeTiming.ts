// Sprint 62 P0 — Realtime transcription timing instrumentation.
//
// Goal:
//   Make the «press button → see text» pipeline observable end-to-end.
//   Production reported: «Живая транскрипция стоит пустой долго, потом
//   резко появляется текст». Until Sprint 62, we had structured events
//   (Sprint 49-59) but NOT elapsed-time markers, so ops couldn't
//   answer:
//     • how long does WebRTC setup take?
//     • how long until first audio packet?
//     • how long until first interim token?
//     • does the «sudden burst» mean «5s no audio» or «5s ASR latency»?
//
// This module collects timestamps and emits a structured timing log on
// each milestone PLUS a final summary on session end. No raw transcript
// content is logged — only timing + counts.
//
// Milestones:
//   sessionRequested  — POST /api/realtime/transcription-session sent
//   sessionIssued     — server responded with client secret
//   micRequested      — getUserMedia({audio:…}) called
//   micReady          — audioTrack received
//   sdpExchangeStart  — POST /v1/realtime/calls (SDP offer) sent
//   sdpExchangeDone   — answer SDP received, setRemoteDescription complete
//   dataChannelOpen   — oai-events channel opened
//   firstDelta        — first transcription delta event received
//   firstFinal        — first transcription.completed event received
//   firstInterimRender — UI received first non-empty interim (called from React side)
//   firstFinalRender  — UI appended first final segment (called from React side)
//
// Output:
//   • `[transcription/timing] milestone=<name> elapsedMs=<n>` for every milestone
//   • `[transcription/timing-summary] ...` on session end with all milestones
//
// Heuristic SLOs (from manual prod profiling):
//   • sessionIssued < 800ms
//   • micReady < 400ms after sessionIssued (longer first-time due to permission prompt)
//   • dataChannelOpen < 1500ms after sessionIssued
//   • firstDelta < 2500ms after sessionIssued (highly variable; OpenAI latency)
//   • firstInterimRender < 50ms after firstDelta (React render)

export type RealtimeMilestone =
  | 'sessionRequested'
  | 'sessionIssued'
  | 'micRequested'
  | 'micReady'
  | 'sdpExchangeStart'
  | 'sdpExchangeDone'
  | 'dataChannelOpen'
  | 'firstDelta'
  | 'firstFinal'
  | 'firstInterimRender'
  | 'firstFinalRender';

export interface MilestoneRecord {
  name: RealtimeMilestone;
  ts: number;          // absolute timestamp (performance.now())
  elapsedFromStart: number;
}

export interface RealtimeTimingTrace {
  /** Static identifier for grep-ability across logs. */
  traceId: string;
  /** Absolute start (performance.now() at construction). */
  startedAt: number;
  /** Mark a milestone. Idempotent: subsequent marks of the same name are ignored. */
  mark: (name: RealtimeMilestone, details?: Record<string, unknown>) => void;
  /** Get current state (e.g. for debugging or final summary). */
  snapshot: () => { traceId: string; startedAt: number; milestones: MilestoneRecord[] };
  /** Emit final summary line. Idempotent. */
  finalize: (reason: 'closed' | 'error' | 'stopped') => void;
}

const SEEN_PROPERTY = '__seen';

export function createRealtimeTimingTrace(traceId: string): RealtimeTimingTrace {
  const startedAt = performance.now();
  const milestones: MilestoneRecord[] = [];
  const seen = new Set<RealtimeMilestone>();
  let finalized = false;

  const mark = (name: RealtimeMilestone, details: Record<string, unknown> = {}): void => {
    if (seen.has(name)) return;
    seen.add(name);
    const ts = performance.now();
    const elapsedFromStart = Math.round(ts - startedAt);
    milestones.push({ name, ts, elapsedFromStart });
    try {
      console.debug('[transcription/timing]', {
        traceId,
        milestone: name,
        elapsedMs: elapsedFromStart,
        ...details,
      });
    } catch { /* ignore */ }
  };

  const snapshot = () => ({ traceId, startedAt, milestones: milestones.slice() });

  const finalize = (reason: 'closed' | 'error' | 'stopped'): void => {
    if (finalized) return;
    finalized = true;
    const total = Math.round(performance.now() - startedAt);
    const flat: Record<string, number> = {};
    for (const m of milestones) flat[m.name] = m.elapsedFromStart;
    try {
      console.debug('[transcription/timing-summary]', {
        traceId,
        reason,
        totalMs: total,
        milestones: flat,
      });
    } catch { /* ignore */ }
  };

  return { traceId, startedAt, mark, snapshot, finalize };
}

// Convenience: detect when first non-empty interim text arrives in React.
// Called from useEffect on interim state in SalesAssistant. Idempotent.
export function markFirstInterimRender(trace: RealtimeTimingTrace | null, currentInterim: string): void {
  if (!trace) return;
  if (!currentInterim || !currentInterim.trim()) return;
  if ((trace as unknown as Record<string, unknown>)[SEEN_PROPERTY] === 'interim') return;
  trace.mark('firstInterimRender', { chars: currentInterim.length });
  (trace as unknown as Record<string, unknown>)[SEEN_PROPERTY] = 'interim';
}

export function markFirstFinalRender(trace: RealtimeTimingTrace | null, finalCharCount: number): void {
  if (!trace) return;
  trace.mark('firstFinalRender', { chars: finalCharCount });
}
