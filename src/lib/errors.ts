/**
 * Turns anything thrown into an `Error` with a readable message. supabase-js returns PostgREST errors as plain
 * `{ message, code, details, hint }` objects (not `Error`s), so `String(e)` would show "[object Object]" (HAN-60).
 */
export function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string' && e.message) {
    const error = new Error(e.message);
    if ('code' in e && typeof e.code === 'string') Object.assign(error, { code: e.code });
    return error;
  }
  if (typeof e === 'string' && e) return new Error(e);
  return new Error('Something went wrong.');
}
