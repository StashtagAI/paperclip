import { Directory, File, Paths } from 'expo-file-system';

// The subset of whisper.rn (0.7) used here. Its package "exports" only maps subpaths, and its "react-native" condition
// points tsc at raw sources that don't typecheck under our settings, so the module is required and typed locally.
type WhisperContext = {
  transcribe(path: string, options: { language: string }): { stop(): Promise<void>; promise: Promise<{ result: string }> };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { initWhisper } = require('whisper.rn/index') as { initWhisper(o: { filePath: string }): Promise<WhisperContext> };

// whisper.cpp "base.en" quantised to q5_1 (57 MB): small enough to download on first use, much better than tiny.en on
// ingredient lists. Pinned to a repo commit so the file can't change under us; size is checked after download.
const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.en-q5_1.bin';
const MODEL_BYTES = 59_721_011;
export const MODEL_LABEL = 'Whisper base.en (57 MB)';

function modelFile() {
  return new File(new Directory(Paths.document, 'models'), 'ggml-base.en-q5_1.bin');
}

export function isModelDownloaded(): boolean {
  const file = modelFile();
  return file.exists && file.size === MODEL_BYTES;
}

/** Downloads the speech model once; `onProgress` gets 0..1. */
export async function downloadModel(onProgress?: (fraction: number) => void): Promise<void> {
  if (isModelDownloaded()) return;
  const file = modelFile();
  const dir = new Directory(Paths.document, 'models');
  if (!dir.exists) dir.create({ intermediates: true });
  if (file.exists) file.delete();
  const task = File.createDownloadTask(MODEL_URL, file, {
    onProgress: ({ bytesWritten }) => onProgress?.(Math.min(bytesWritten / MODEL_BYTES, 1)),
  });
  await task.downloadAsync();
  if (file.size !== MODEL_BYTES) {
    file.delete();
    throw new Error('The speech model download was incomplete. Try again on Wi-Fi.');
  }
}

let context: Promise<WhisperContext> | null = null;

/** On-device speech-to-text of a 16 kHz mono WAV with whisper.rn. Returns the text and how long it took. */
export async function transcribeWav(wavUri: string): Promise<{ text: string; ms: number }> {
  if (!isModelDownloaded()) throw new Error('Download the speech model first.');
  const loading = (context ??= initWhisper({ filePath: modelFile().uri }));
  const started = Date.now();
  const whisper = await loading.catch((e: unknown) => {
    context = null;
    throw e;
  });
  const { promise } = whisper.transcribe(wavUri, { language: 'en' });
  const { result } = await promise;
  return { text: result.trim(), ms: Date.now() - started };
}
