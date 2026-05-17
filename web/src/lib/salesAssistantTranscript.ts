export interface AnalyzeTranscriptSegment {
  final?: boolean;
  text: string;
}

export interface AnalyzeTranscriptInput {
  manualContext?: string | null;
  liveSegments?: AnalyzeTranscriptSegment[] | null;
  interimTranscript?: string | null;
}

export interface AnalyzeTranscriptStats {
  manualContextChars: number;
  liveTranscriptChars: number;
  interimChars: number;
  finalPayloadChars: number;
}

export function composeAnalyzeTranscript(input: AnalyzeTranscriptInput): string {
  const manual = (input.manualContext ?? '').trim();
  const live = (input.liveSegments ?? [])
    .filter((segment) => segment.final)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n');
  const interim = (input.interimTranscript ?? '').trim();

  const parts: string[] = [];
  if (manual) parts.push(manual);
  if (live) parts.push(live);

  let base = parts.join('\n');
  if (!interim) return base;
  if (base && base.endsWith(interim)) return base;

  base = base ? `${base}\n${interim}` : interim;
  return base;
}

export function getAnalyzeTranscriptStats(input: AnalyzeTranscriptInput): AnalyzeTranscriptStats {
  const manual = (input.manualContext ?? '').trim();
  const live = (input.liveSegments ?? [])
    .filter((segment) => segment.final)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n');
  const interim = (input.interimTranscript ?? '').trim();
  const finalPayload = composeAnalyzeTranscript(input);

  return {
    manualContextChars: manual.length,
    liveTranscriptChars: live.length,
    interimChars: interim.length,
    finalPayloadChars: finalPayload.length,
  };
}
