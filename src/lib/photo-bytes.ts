import { File } from 'expo-file-system';

/** The picked photo's bytes for upload; the picker leaves a copy in the app's cache. */
export function photoBytes(uri: string): Promise<ArrayBuffer> {
  return new File(uri).arrayBuffer();
}
