import { MIN_PASSWORD_LENGTH, newPasswordError, resetSentMessage } from '@/lib/password-reset';

describe('newPasswordError', () => {
  it('rejects a short password', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(newPasswordError(short, short)).toMatch(/at least/);
  });

  it('rejects mismatched passwords', () => {
    expect(newPasswordError('correct horse', 'correct house')).toMatch(/match/);
  });

  it('accepts matching passwords of the minimum length', () => {
    const ok = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(newPasswordError(ok, ok)).toBeNull();
  });
});

describe('resetSentMessage', () => {
  it('does not say whether the address has an account', () => {
    const message = resetSentMessage('someone@example.com');
    expect(message).toContain('If someone@example.com has an account');
    expect(message).not.toMatch(/no account|not found|doesn’t exist/i);
  });
});
