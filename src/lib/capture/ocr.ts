import { requireOptionalNativeModule } from 'expo';

type TextExtractor = { isSupported: boolean; extractTextFromImage(path: string): Promise<string[]> };

// Looked up optionally instead of importing 'expo-text-extractor', whose entry throws at import time when the native
// module isn't in the binary (Expo Go, or a build made before it was added). That throw took the whole capture route down.
const extractor = requireOptionalNativeModule<TextExtractor>('ExpoTextExtractor');

/** On-device OCR: Apple Vision on iOS, ML Kit Text Recognition v2 on Android (via expo-text-extractor). */
export async function recognizeText(uri: string): Promise<string> {
  if (!extractor?.isSupported) throw new Error('Text recognition isn’t available in this build of the app.');
  const blocks = await extractor.extractTextFromImage(uri.replace('file://', ''));
  return blocks.join('\n');
}
