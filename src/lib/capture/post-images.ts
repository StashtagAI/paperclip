import { File, Paths } from 'expo-file-system';

import { recognizeText } from '@/lib/capture/ocr';

/** Downloads one of the post's pictures to the cache, reads its text on the device, and deletes the copy. */
export async function readPostImage(url: string, index: number): Promise<string> {
  const file = new File(Paths.cache, `post-image-${Date.now()}-${index}.jpg`);
  try {
    const saved = await File.downloadFileAsync(url, file);
    return await recognizeText(saved.uri);
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // the OS clears the cache anyway
    }
  }
}
