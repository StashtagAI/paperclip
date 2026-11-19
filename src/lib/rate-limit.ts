/**
 * Abuse limits (HAN-38). The limits themselves are enforced server side: Supabase Auth throttles sign-in emails and
 * attempts, and a trigger caps `feedback` inserts. These helpers turn those 429s into plain-language messages and
 * drive the resend countdown on the sign-in screen.
 */

/** Supabase Auth refuses a second sign-in email to the same address within this window (its default). */
export const EMAIL_RESEND_SECONDS = 60;

type MaybeError = { status?: number; code?: string; message?: string } | null | undefined;

const RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit', 'PT429']);

export function isRateLimited(error: MaybeError): boolean {
  if (!error) return false;
  return error.status === 429 || RATE_LIMIT_CODES.has(error.code ?? '');
}

/** Seconds to wait, when Auth says so ("you can only request this after 37 seconds"). */
export function retryAfterSeconds(error: MaybeError): number | null {
  const match = error?.message?.match(/after (\d+) seconds?/i);
  return match ? Number(match[1]) : null;
}

export function waitPhrase(seconds: number): string {
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

/** Message for a failed "email me a sign-in link". */
export function sendLinkErrorMessage(error: NonNullable<MaybeError>): string {
  if (!isRateLimited(error)) return error.message ?? 'Something went wrong. Try again.';
  const wait = retryAfterSeconds(error);
  if (wait) return `A sign-in email was sent recently. You can ask for another in ${waitPhrase(wait)}.`;
  return 'Too many sign-in emails were requested. Wait a few minutes and try again, or sign in with your password.';
}

/** Message for a failed password sign-in, sign-up or code check. */
export function signInErrorMessage(error: NonNullable<MaybeError>): string {
  if (!isRateLimited(error)) return error.message ?? 'Something went wrong. Try again.';
  return 'Too many attempts. Wait a few minutes and try again.';
}

/** Message for a failed feedback send. */
export function feedbackErrorMessage(error: NonNullable<MaybeError>): string {
  if (isRateLimited(error)) {
    return 'You’ve sent a lot of feedback recently. Try again later, or use Contact support on your Profile.';
  }
  return `Couldn’t send your feedback: ${error.message ?? 'something went wrong'}`;
}

/** Whole seconds left until `until` (a Date.now() value), never negative. */
export function secondsLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}
