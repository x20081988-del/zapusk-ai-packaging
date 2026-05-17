// Sprint 58 P0.1 + P0.2 — Lossless realtime transcript pipeline observability.
//
// Architecture (single source of truth for stage names):
//
//   rawRealtimeEvent          (OpenAI Realtime emits a `completed` event)
//        ↓
//   normalizedSegment         (brand normalize, trim)
//        ↓
//   guardedSegment            (passed hallucination guard)
//        ↓
//   finalSegment              (passed dedup, ready to append)
//        ↓
//   aggregatedTranscript      (lives in setTranscript state)
//
// Every segment is assigned a unique `segmentId` (cuid-like) when it first
// enters the pipeline. Each subsequent stage records a lifecycle entry
// under the SAME segmentId, so ops can trace the entire path of any
// single phrase end-to-end.
//
// Storage:
//   • In-memory ring buffer (last 500 entries) — cheap, no persistence.
//   • Per-segment status flag — quick «did this reach UI?» lookup.
//   • Snapshot accessor for DevTools inspection.
//
// NEVER log full transcript content. 80-char preview max.

export type LifecycleStage =
  | 'raw_received'           // OpenAI realtime emitted a completed segment
  | 'normalized'             // brand normalizer applied
  | 'hallucination_filtered' // dropped by guard
  | 'dedup_filtered'         // dropped as duplicate of previous segment
  | 'stale_dropped'          // wrong session id / stopped
  | 'appended'               // landed in transcript[] state
  | 'overwritten'            // (reserved — clean transcript replaces draft)
  | 'finalized';             // (reserved — frozen after finalize)

export type LifecycleStatus = 'ok' | 'dropped';

export interface LifecycleEntry {
  ts: number;
  segmentId: string;
  sessionId: string;
  source: 'realtime' | 'web-speech' | 'offline-clean';
  stage: LifecycleStage;
  status: LifecycleStatus;
  chars: number;
  preview: string; // capped at 80 chars
  reason?: string; // populated when status='dropped'
}

const RING_BUFFER_CAPACITY = 500;
const PREVIEW_MAX = 80;

let _ring: LifecycleEntry[] = [];
const _bySegment = new Map<string, LifecycleEntry[]>();
let _segmentCounter = 0;

// Stable segment-id generator. Format: `seg_<base36-timestamp>_<counter>`.
// Counter prevents collisions when two events arrive in the same ms.
export function newSegmentId(): string {
  _segmentCounter++;
  return `seg_${Date.now().toString(36)}_${_segmentCounter.toString(36)}`;
}

// `text` becomes preview + chars internally. Caller never sets ts/preview/chars
// directly — keeps the API simple and prevents accidental full-text leaks.
export interface LifecycleInput {
  segmentId: string;
  sessionId: string;
  source: 'realtime' | 'web-speech' | 'offline-clean';
  stage: LifecycleStage;
  status: LifecycleStatus;
  text: string;
  reason?: string;
}

export function recordLifecycle(entry: LifecycleInput): void {
  const safe: LifecycleEntry = {
    ts: Date.now(),
    segmentId: entry.segmentId,
    sessionId: entry.sessionId,
    source: entry.source,
    stage: entry.stage,
    status: entry.status,
    chars: entry.text.length,
    preview: entry.text.length > PREVIEW_MAX ? entry.text.slice(0, PREVIEW_MAX) + '…' : entry.text,
    ...(entry.reason ? { reason: entry.reason } : {}),
  };
  _ring.push(safe);
  if (_ring.length > RING_BUFFER_CAPACITY) {
    _ring = _ring.slice(-RING_BUFFER_CAPACITY);
    // GC per-segment map: drop segments whose entries are all out of the ring.
    if (_bySegment.size > RING_BUFFER_CAPACITY) {
      const live = new Set(_ring.map((e) => e.segmentId));
      for (const id of _bySegment.keys()) {
        if (!live.has(id)) _bySegment.delete(id);
      }
    }
  }
  const list = _bySegment.get(safe.segmentId) ?? [];
  list.push(safe);
  _bySegment.set(safe.segmentId, list);
  // Structured console log — same taxonomy as Sprint 57.
  try {
    console.debug(`[transcription/${safe.stage}]`, {
      segmentId: safe.segmentId,
      sessionId: safe.sessionId,
      source: safe.source,
      status: safe.status,
      chars: safe.chars,
      preview: safe.preview,
      ...(safe.reason ? { reason: safe.reason } : {}),
    });
  } catch { /* ignore */ }
}

// Snapshot for DevTools or QA: returns flat ring or per-segment lifecycle.
export function getLifecycleSnapshot(): LifecycleEntry[] {
  return [..._ring];
}

export function getSegmentLifecycle(segmentId: string): LifecycleEntry[] {
  return _bySegment.get(segmentId) ?? [];
}

// Per-segment quick lookup: did this segment make it to UI state?
export function didSegmentReachUi(segmentId: string): boolean {
  const entries = _bySegment.get(segmentId);
  if (!entries) return false;
  return entries.some((e) => e.stage === 'appended' && e.status === 'ok');
}

// Reset is used only by tests to keep ring isolated between cases.
export function _resetLifecycleForTests(): void {
  _ring = [];
  _bySegment.clear();
  _segmentCounter = 0;
}

// Sprint 58 P0.3 — Interim vs Final diff. Detects when the model's
// `completed` event differs significantly from the accumulated interim
// buffer that preceded it. High mutation = sign that the model rewrote
// what it heard. Helps catch silent paraphrasing.
//
// Both inputs are strings; we compute Jaccard on tokens ≥3 chars (same
// rule as server transcriptDiff). Returns mutationRatio = 1 - similarity.

export interface InterimFinalDiff {
  similarity: number;       // 0..1
  mutationRatio: number;    // 1 - similarity
  interimChars: number;
  finalChars: number;
  // Heuristic flag: high mutation + meaningful length = suspicious rewrite.
  suspiciousMutation: boolean;
}

function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  return new Set(
    text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length >= 3),
  );
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const u = a.size + b.size - inter;
  return u === 0 ? 0 : inter / u;
}

const SUSPICIOUS_MUTATION_THRESHOLD = 0.5; // >50% token churn
const SUSPICIOUS_MIN_CHARS = 20;            // ignore tiny segments

export function compareInterimVsFinal(interim: string, final: string): InterimFinalDiff {
  const ai = (interim ?? '').trim();
  const fi = (final ?? '').trim();
  const similarity = jaccard(tokenize(ai), tokenize(fi));
  const mutationRatio = 1 - similarity;
  return {
    similarity,
    mutationRatio,
    interimChars: ai.length,
    finalChars: fi.length,
    suspiciousMutation:
      mutationRatio > SUSPICIOUS_MUTATION_THRESHOLD &&
      fi.length >= SUSPICIOUS_MIN_CHARS,
  };
}
