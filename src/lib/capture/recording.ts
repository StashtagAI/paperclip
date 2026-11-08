import MediaExtract from '../../../modules/media-extract';

import { dedupeLines } from '@/lib/capture/lines';
import { recognizeText } from '@/lib/capture/ocr';
import { transcribeWav } from '@/lib/capture/transcribe';

/** One frame a second, up to 90 frames; longer recordings are sampled more sparsely. */
const MAX_FRAMES = 90;
const FRAME_MAX_PX = 1600;
const MAX_AUDIO_SECONDS = 600;

export function frameIntervalMs(durationMs: number | null | undefined): number {
  return Math.max(1000, Math.ceil((durationMs ?? 0) / MAX_FRAMES));
}

/** Samples frames from a screen recording and OCRs them on the device; repeated overlay lines are dropped. */
export async function recordingText(uri: string, durationMs: number | null | undefined) {
  const started = Date.now();
  const frames = await MediaExtract.extractFramesAsync(uri, frameIntervalMs(durationMs), MAX_FRAMES, FRAME_MAX_PX);
  const texts: string[] = [];
  for (const frame of frames) texts.push(await recognizeText(frame).catch(() => ''));
  return { lines: dedupeLines(texts), frames: frames.length, ms: Date.now() - started };
}

/** Pulls the audio track out as 16 kHz WAV and transcribes it on the device. Null when the recording has no audio. */
export async function recordingTranscript(uri: string) {
  const started = Date.now();
  const wav = await MediaExtract.extractAudioAsync(uri, MAX_AUDIO_SECONDS);
  if (!wav) return null;
  const extractMs = Date.now() - started;
  const { text, ms } = await transcribeWav(wav);
  return { text, extractMs, transcribeMs: ms };
}
