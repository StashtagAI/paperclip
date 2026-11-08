import { clip, dedupeLines } from '@/lib/capture/lines';
import type { Captured } from '@/lib/types';

/** Where a piece of captured text came from; shown on the capture and review screens. */
export type SegmentSource = 'caption' | 'screenshot' | 'recording_text' | 'recording_audio';

export type Segment = {
  id: string;
  source: SegmentSource;
  /** e.g. "Screenshot 2 of 3", "Screen recording · 24 frames" */
  label: string;
  status: 'working' | 'ready' | 'failed';
  text: string;
  /** Timing note shown under the segment, e.g. "Transcribed in 8.2 s". */
  note?: string;
};

export const SOURCE_LABELS: Record<SegmentSource, string> = {
  caption: 'Pasted caption',
  screenshot: 'Screenshot text',
  recording_text: 'On-screen text',
  recording_audio: 'Spoken audio',
};

/**
 * Builds the process-link `captured` payload from the ready segments: pasted caption -> caption, spoken audio ->
 * transcript, and every OCR source (screenshots, recording frames) -> ocr, with repeated lines removed.
 */
export function toCaptured(segments: readonly Segment[]): Captured {
  const ready = segments.filter((s) => s.status === 'ready' && s.text.trim());
  const of = (...sources: SegmentSource[]) => ready.filter((s) => sources.includes(s.source)).map((s) => s.text.trim());
  const caption = of('caption').join('\n\n');
  const transcript = of('recording_audio').join('\n\n');
  const ocr = dedupeLines(of('screenshot', 'recording_text')).join('\n');
  const captured: Captured = {};
  if (caption) captured.caption = clip(caption);
  if (transcript) captured.transcript = clip(transcript);
  if (ocr) captured.ocr = clip(ocr);
  return captured;
}

export const hasText = (c: Captured) => Boolean(c.caption || c.transcript || c.ocr);
