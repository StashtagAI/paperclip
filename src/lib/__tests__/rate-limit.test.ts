import {
  feedbackErrorMessage,
  isRateLimited,
  retryAfterSeconds,
  secondsLeft,
  sendLinkErrorMessage,
  signInErrorMessage,
} from '../rate-limit';

// Shapes as returned by supabase-js: AuthApiError for Auth, PostgrestError for the feedback insert.
const perEmail = {
  status: 429,
  code: 'over_email_send_rate_limit',
  message: 'For security purposes, you can only request this after 37 seconds.',
};
const projectEmails = { status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' };
const tooManyRequests = { status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' };
const feedbackQuota = { code: 'PT429', message: 'feedback_rate_limited' };
const badCredentials = { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' };

describe('isRateLimited', () => {
  it.each([perEmail, projectEmails, tooManyRequests, feedbackQuota, { status: 429 }])('detects %o', (e) => {
    expect(isRateLimited(e)).toBe(true);
  });
  it('ignores other errors', () => {
    expect(isRateLimited(badCredentials)).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});

describe('retryAfterSeconds', () => {
  it('reads the wait from the Auth message', () => {
    expect(retryAfterSeconds(perEmail)).toBe(37);
    expect(retryAfterSeconds({ message: 'only request this after 1 second' })).toBe(1);
  });
  it('is null when Auth gives no wait', () => {
    expect(retryAfterSeconds(projectEmails)).toBeNull();
  });
});

describe('messages', () => {
  it('tells the user how long to wait for another sign-in email', () => {
    expect(sendLinkErrorMessage(perEmail)).toBe(
      'A sign-in email was sent recently. You can ask for another in 37 seconds.',
    );
  });
  it('offers the password route when the project email limit is hit', () => {
    expect(sendLinkErrorMessage(projectEmails)).toMatch(/sign in with your password/);
  });
  it('keeps non-limit errors as they are', () => {
    expect(sendLinkErrorMessage(badCredentials)).toBe('Invalid login credentials');
    expect(signInErrorMessage(badCredentials)).toBe('Invalid login credentials');
    expect(feedbackErrorMessage({ message: 'offline' })).toBe('Couldn’t send your feedback: offline');
  });
  it('explains sign-in and feedback limits without the raw error code', () => {
    expect(signInErrorMessage(tooManyRequests)).toBe('Too many attempts. Wait a few minutes and try again.');
    expect(feedbackErrorMessage(feedbackQuota)).not.toMatch(/PT429|feedback_rate_limited/);
  });
});

describe('secondsLeft', () => {
  it('rounds up and stops at zero', () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
  });
});
