/** The name friends see when you share a list with them (HAN-71). Matches the check on public.profiles. */
export const DISPLAY_NAME_MAX = 50;

/** Trims, joins runs of spaces and drops control characters; empty means no name. */
export function cleanDisplayName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DISPLAY_NAME_MAX)
    .trim();
}

/** Who shared a list, for owners who haven't set a name (shares made before names existed). */
export const sharerName = (name: string | null) => name ?? 'A friend';
