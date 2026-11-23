import {
  SOCIAL_PROVIDERS,
  isAppleRelayEmail,
  linkedProviders,
  oauthRedirectParams,
  socialErrorMessage,
} from '@/lib/sign-in-providers';

describe('sign-in providers (HAN-112)', () => {
  it('always offers Apple alongside Google (App Store Review 4.8)', () => {
    expect(SOCIAL_PROVIDERS).toEqual(['apple', 'google']);
  });

  it('spots Apple Hide My Email addresses', () => {
    expect(isAppleRelayEmail('abc123@privaterelay.appleid.com')).toBe(true);
    expect(isAppleRelayEmail(' ABC@PrivateRelay.AppleID.com ')).toBe(true);
    expect(isAppleRelayEmail('ana@icloud.com')).toBe(false);
    expect(isAppleRelayEmail('privaterelay.appleid.com@example.com')).toBe(false);
    expect(isAppleRelayEmail(null)).toBe(false);
  });

  it('lists only the three social providers among identities', () => {
    const linked = linkedProviders([{ provider: 'email' }, { provider: 'google' }, { provider: 'apple' }, { provider: 'github' }]);
    expect([...linked].sort()).toEqual(['apple', 'google']);
    expect(linkedProviders(undefined).size).toBe(0);
  });

  it('reads the PKCE code or error from the redirect', () => {
    expect(oauthRedirectParams('stashtag://auth/callback?code=abc-123')).toEqual({ code: 'abc-123', error: null });
    expect(oauthRedirectParams('stashtag://auth/callback#error=access_denied&error_description=User+cancelled')).toEqual({
      code: null,
      error: 'User cancelled',
    });
    expect(oauthRedirectParams('stashtag://auth/callback?error=server_error')).toEqual({ code: null, error: 'server_error' });
    expect(oauthRedirectParams('stashtag://auth/callback')).toEqual({ code: null, error: null });
  });

  it('explains common failures in plain words', () => {
    expect(socialErrorMessage('google', { message: 'Unsupported provider: provider is not enabled' })).toBe(
      'Sign in with Google isn’t turned on yet. Use your email for now.',
    );
    expect(socialErrorMessage('apple', { code: 'identity_already_exists', message: 'Identity is already linked to another user' }, 'connect')).toMatch(
      /^That Apple account already belongs to another Stashtag account/,
    );
    expect(socialErrorMessage('facebook', { code: 'manual_linking_disabled', message: 'Manual linking is disabled' }, 'connect')).toBe(
      'Connecting Facebook isn’t turned on yet.',
    );
    expect(socialErrorMessage('facebook', { message: 'Network request failed.' })).toBe(
      'Couldn’t sign in with Facebook: Network request failed. Try again.',
    );
    expect(socialErrorMessage('google', null, 'connect')).toBe('Couldn’t connect Google. Try again.');
  });
});
