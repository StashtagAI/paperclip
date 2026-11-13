// links.error is read by the app, so it only ever holds a short machine code. Anything else (Postgres messages,
// model output, upstream bodies) is logged on the server and replaced by "internal_error".
const CODE = /^[a-z][a-z0-9_]{0,39}$/;

export function errorCode(e: unknown): { code: string; detail: string } {
  const detail = String((e as { message?: unknown })?.message ?? e).slice(0, 500);
  return { code: CODE.test(detail) ? detail : "internal_error", detail };
}

/** Statuses a run may not start from. index.ts applies the same list in the atomic claim (`not status in ...`). */
export const UNCLAIMABLE = ["processing", "done"] as const;

/** Why a run can't start for a link in this status, or null if it can. A done link is never re-run for free. */
export const claimBlock = (status: string): "already_processing" | "already_done" | null =>
  status === "processing" ? "already_processing" : status === "done" ? "already_done" : null;
