import { cleanDisplayName, DISPLAY_NAME_MAX } from '../display-name';

describe('cleanDisplayName', () => {
  it('trims and joins spaces', () => {
    expect(cleanDisplayName('  Matt   Smith \n')).toBe('Matt Smith');
  });

  it('drops control characters', () => {
    expect(cleanDisplayName('Matt\u0000\u0007Smith')).toBe('Matt Smith');
  });

  it('is empty for blank input', () => {
    expect(cleanDisplayName(' \t ')).toBe('');
  });

  it('cuts to the limit without a trailing space', () => {
    const name = cleanDisplayName(`${'a'.repeat(DISPLAY_NAME_MAX - 1)} bcd`);
    expect(name).toBe('a'.repeat(DISPLAY_NAME_MAX - 1));
  });
});
