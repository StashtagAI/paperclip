/** Google, Apple and Facebook sign-in (HAN-112): the parts that don't touch the network, so they can be unit-tested. */

export type SocialProvider = 'apple' | 'google' | 'facebook';

/**
 * Button order on the sign-in screen. Apple stays whenever the others are offered (App Store Review 4.8).
 * Facebook is off until the Meta app is set up (board, 23 Nov); add it back here to turn it on.
 */
export const SOCIAL_PROVIDERS: readonly SocialProvider[] = ['apple', 'google'];

export const PROVIDER_NAMES: Record<SocialProvider, string> = { apple: 'Apple', google: 'Google', facebook: 'Facebook' };

/** Apple's "Hide My Email" addresses. Mail to them is forwarded, but they never match an existing account's email. */
export function isAppleRelayEmail(email: string | null | undefined): boolean {
  return !!email && /@privaterelay\.appleid\.com$/i.test(email.trim());
}

/** Which of the three providers are linked to the account (from `user.identities`). */
export function linkedProviders(identities: readonly { provider: string }[] | null | undefined): Set<SocialProvider> {
  const linked = new Set<SocialProvider>();
  for (const { provider } of identities ?? []) {
    if ((SOCIAL_PROVIDERS as readonly string[]).includes(provider)) linked.add(provider as SocialProvider);
  }
  return linked;
}

/** The `code` (PKCE) or error Supabase Auth puts on the redirect back to stashtag://auth/callback, in the query or hash. */
export function oauthRedirectParams(url: string): { code: string | null; error: string | null } {
  const params = new URLSearchParams();
  const query = url.split('#')[0].split('?')[1];
  const hash = url.split('#')[1];
  for (const part of [query, hash]) {
    if (part) new URLSearchParams(part).forEach((value, key) => params.set(key, value));
  }
  const error = params.get('error_description') ?? params.get('error');
  return { code: params.get('code'), error: error ? error.replace(/\+/g, ' ') : null };
}

type MaybeError = { code?: string; message?: string } | null | undefined;

/** Plain-language message for a failed Google/Apple/Facebook sign-in or connect. */
export function socialErrorMessage(provider: SocialProvider, error: MaybeError, action: 'sign-in' | 'connect' = 'sign-in'): string {
  const name = PROVIDER_NAMES[provider];
  const message = error?.message ?? '';
  if (error?.code === 'provider_disabled' || /provider is not enabled|unsupported provider/i.test(message)) {
    return `Sign in with ${name} isn’t turned on yet. Use your email for now.`;
  }
  if (error?.code === 'identity_already_exists' || /already linked|identity.*already exists/i.test(message)) {
    return `That ${name} account already belongs to another Stashtag account. Sign in with ${name} to use that one.`;
  }
  if (error?.code === 'manual_linking_disabled' || /manual linking is disabled/i.test(message)) {
    return `Connecting ${name} isn’t turned on yet.`;
  }
  const what = action === 'connect' ? `connect ${name}` : `sign in with ${name}`;
  return `Couldn’t ${what}${message ? `: ${message.replace(/\.$/, '')}` : ''}. Try again.`;
}
