/** Browsers can't fetch Instagram's image hosts (no CORS), so the web app goes straight to the server read. */
export async function readPostImage(): Promise<string> {
  throw new Error('Pictures can’t be read in the browser.');
}
