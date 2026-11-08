import { extractTextFromImage, isSupported } from 'expo-text-extractor';

/** On-device OCR: Apple Vision on iOS, ML Kit Text Recognition v2 on Android (via expo-text-extractor). */
export async function recognizeText(uri: string): Promise<string> {
  if (!isSupported) throw new Error('Text recognition isn’t available on this device.');
  const blocks = await extractTextFromImage(uri);
  return blocks.join('\n');
}
