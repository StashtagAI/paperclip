/** Supabase's default minimum; sign-up and the new-password screen both check it before calling the server. */
export const MIN_PASSWORD_LENGTH = 6;

/** Supabase lets one address request a reset email about once a minute; the "Send again" button waits the same. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Error for the new-password form, or null when it can be submitted. */
export function newPasswordError(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return 'The two passwords don’t match.';
  return null;
}

/**
 * Shown after a reset request whether or not the address has an account, so the form can't be used to find out who
 * has signed up.
 */
export function resetSentMessage(email: string) {
  return `If ${email} has an account, we’ve emailed it a link and a code. Open the link on this device, or enter the code below.`;
}
