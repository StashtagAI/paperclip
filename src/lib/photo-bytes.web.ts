/** The picked photo's bytes for upload; on web the picker hands back a blob: or data: URI. */
export async function photoBytes(uri: string): Promise<ArrayBuffer> {
  return (await fetch(uri)).arrayBuffer();
}
