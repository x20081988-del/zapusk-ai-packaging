// Sprint 59 P0.2 + P0.3 — Live audio quality meter.
//
// Sits next to the live realtime path: attaches a Web Audio API
// AnalyserNode to the same MediaStream, samples 4 times per second,
// computes RMS / peak / silence / clipping, and exposes:
//   • `getCurrentSnapshot()` — latest snapshot
//   • `getAggregate()` — running averages since session start
//   • onClassChange(cb) — fired when quality class transitions
//
// Classifications:
//   good      — RMS in 0.04..0.6, peak < 0.95
//   weak      — RMS < 0.04 sustained > 2s
//   clipping  — peak > 0.97 sustained > 1s
//   silent    — RMS < 0.005 sustained > 4s
//
// All thresholds are heuristic — tuned for typical desktop Russian
// dictation. Add tests/fixtures over time, adjust here.
//
// Sprint 59 P0.3 — this also helps decide whether AGC/NS is hurting us.
// If `actualAGC=true` in [audio/input-config] AND class flips to
// `clipping` repeatedly, AGC may be over-amplifying. Ops can compare
// rawAudioMode (localStorage flag) runs side-by-side.

export type AudioQualityClass = 'good' | 'weak' | 'clipping' | 'silent';

export interface AudioQualitySnapshot {
  ts: number;
  rms: number;          // 0..1 (linear)
  peak: number;         // 0..1 (linear)
  silenceRatio: number; // 0..1 over the last sampling window
  clippingRatio: number;
  cls: AudioQualityClass;
}

export interface AudioQualityAggregate {
  samples: number;
  durationMs: number;
  avgRms: number;
  avgPeak: number;
  weakStretches: number;
  clippingStretches: number;
  silentStretches: number;
  lastClass: AudioQualityClass;
}

export interface AudioQualityMeter {
  stop(): void;
  getCurrentSnapshot(): AudioQualitySnapshot | null;
  getAggregate(): AudioQualityAggregate;
  onClassChange(handler: (next: AudioQualityClass, prev: AudioQualityClass) => void): () => void;
}

const SAMPLING_INTERVAL_MS = 250; // 4Hz — light enough to not affect CPU
const RMS_GOOD_LOW = 0.04;
const RMS_GOOD_HIGH = 0.6;
const RMS_SILENT_CUTOFF = 0.005;
const PEAK_CLIPPING_CUTOFF = 0.97;
const PEAK_GOOD_CEILING = 0.95;
const WEAK_SUSTAINED_MS = 2_000;
const CLIPPING_SUSTAINED_MS = 1_000;
const SILENT_SUSTAINED_MS = 4_000;

export function startAudioQualityMeter(stream: MediaStream): AudioQualityMeter | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx: typeof AudioContext | undefined =
    (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx();
  } catch {
    return null;
  }
  let source: MediaStreamAudioSourceNode;
  try {
    source = ctx.createMediaStreamSource(stream);
  } catch {
    ctx.close().catch(() => {});
    return null;
  }
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);

  const startedAt = Date.now();
  let lastSnapshot: AudioQualitySnapshot | null = null;
  let currentClass: AudioQualityClass = 'good';
  let classEnteredAt = startedAt;
  let samples = 0;
  let sumRms = 0;
  let sumPeak = 0;
  let weakStretches = 0;
  let clippingStretches = 0;
  let silentStretches = 0;
  let classHandlers: Array<(next: AudioQualityClass, prev: AudioQualityClass) => void> = [];
  let stopped = false;

  function computeRmsPeak(buf: Float32Array): { rms: number; peak: number; clipFrac: number; silentFrac: number } {
    let sumSq = 0;
    let peak = 0;
    let clipCount = 0;
    let silentCount = 0;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      sumSq += buf[i] * buf[i];
      if (a > peak) peak = a;
      if (a > PEAK_CLIPPING_CUTOFF) clipCount++;
      if (a < RMS_SILENT_CUTOFF / 5) silentCount++;
    }
    const rms = Math.sqrt(sumSq / buf.length);
    return { rms, peak, clipFrac: clipCount / buf.length, silentFrac: silentCount / buf.length };
  }

  function classifyMomentary(rms: number, peak: number): AudioQualityClass {
    if (rms < RMS_SILENT_CUTOFF) return 'silent';
    if (peak > PEAK_CLIPPING_CUTOFF) return 'clipping';
    if (rms < RMS_GOOD_LOW) return 'weak';
    if (rms > RMS_GOOD_HIGH || peak > PEAK_GOOD_CEILING) return 'clipping';
    return 'good';
  }

  function tick() {
    if (stopped) return;
    try {
      analyser.getFloatTimeDomainData(buffer);
      const { rms, peak, clipFrac, silentFrac } = computeRmsPeak(buffer);
      const cls = classifyMomentary(rms, peak);
      const now = Date.now();
      const snap: AudioQualitySnapshot = {
        ts: now,
        rms,
        peak,
        silenceRatio: silentFrac,
        clippingRatio: clipFrac,
        cls,
      };
      lastSnapshot = snap;
      samples++;
      sumRms += rms;
      sumPeak += peak;

      // Sustained-class transitions: only emit + count when class held
      // long enough to be meaningful (filters glitchy single-sample noise).
      if (cls !== currentClass) {
        const sustain = now - classEnteredAt;
        const sustainedThreshold = currentClass === 'weak' ? WEAK_SUSTAINED_MS
          : currentClass === 'clipping' ? CLIPPING_SUSTAINED_MS
          : currentClass === 'silent' ? SILENT_SUSTAINED_MS
          : 500;
        if (sustain >= sustainedThreshold || cls === 'good') {
          const prev = currentClass;
          currentClass = cls;
          classEnteredAt = now;
          if (cls === 'weak') weakStretches++;
          else if (cls === 'clipping') clippingStretches++;
          else if (cls === 'silent') silentStretches++;
          try {
            console.debug('[audio/rms]', {
              cls,
              prev,
              rms: rms.toFixed(4),
              peak: peak.toFixed(4),
              silenceRatio: silentFrac.toFixed(3),
            });
          } catch { /* ignore */ }
          for (const h of classHandlers) {
            try { h(cls, prev); } catch { /* ignore */ }
          }
        }
      }
    } catch {
      // ignore analyser errors — meter is best-effort
    }
  }
  const intervalId = window.setInterval(tick, SAMPLING_INTERVAL_MS);

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      window.clearInterval(intervalId);
      try { source.disconnect(); } catch { /* ignore */ }
      ctx.close().catch(() => {});
    },
    getCurrentSnapshot(): AudioQualitySnapshot | null {
      return lastSnapshot;
    },
    getAggregate(): AudioQualityAggregate {
      const durationMs = Date.now() - startedAt;
      return {
        samples,
        durationMs,
        avgRms: samples === 0 ? 0 : sumRms / samples,
        avgPeak: samples === 0 ? 0 : sumPeak / samples,
        weakStretches,
        clippingStretches,
        silentStretches,
        lastClass: currentClass,
      };
    },
    onClassChange(handler): () => void {
      classHandlers.push(handler);
      return () => {
        classHandlers = classHandlers.filter((h) => h !== handler);
      };
    },
  };
}
