import { Directory, File, Paths } from 'expo-file-system';
import { Platform, Share } from 'react-native';

import { KML_MIME, type SaveOutcome } from '@/lib/map-export';

const cancelled = (e: unknown) => /cancel/i.test(`${(e as { code?: string }).code ?? ''} ${(e as Error).message ?? ''}`);

/**
 * Hands the KML file to the user (HAN-141). iOS: the share sheet with the file, for Mail, AirDrop or Save to Files.
 * Android: React Native's share sheet can't carry a file, so the system folder picker saves it (Downloads, Drive).
 */
export async function saveKml(fileName: string, kml: string): Promise<SaveOutcome> {
  if (Platform.OS === 'android') {
    let dir: Directory;
    try {
      dir = await Directory.pickDirectoryAsync();
    } catch (e) {
      if (cancelled(e)) return 'dismissed';
      throw e;
    }
    dir.createFile(fileName, KML_MIME).write(kml);
    return 'saved';
  }
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(kml);
  const result = await Share.share({ url: file.uri, title: fileName });
  return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
}
