import { KML_MIME, type SaveOutcome } from '@/lib/map-export';

/** On the web app the file downloads straight away, ready to import into My Maps on the same computer (HAN-141). */
export async function saveKml(fileName: string, kml: string): Promise<SaveOutcome> {
  const url = URL.createObjectURL(new Blob([kml], { type: KML_MIME }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoking at once can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return 'downloaded';
}
