import type { Worker } from 'tesseract.js';

let worker: Promise<Worker> | null = null;

/**
 * Web OCR with tesseract.js, run in the browser. The image never leaves the device; tesseract downloads its wasm core
 * and English language data from its CDN on first use.
 */
export async function recognizeText(uri: string): Promise<string> {
  worker ??= import('tesseract.js').then(({ createWorker }) => createWorker('eng'));
  const { data } = await (await worker).recognize(uri);
  return data.text;
}
