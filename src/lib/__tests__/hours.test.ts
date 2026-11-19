import { clock, googleRating, openStatus, todayIndex } from '@/lib/hours';
import type { OpeningHours } from '@/lib/types';

const p = (day: number, hour: number, minute = 0) => ({ day, hour, minute });
// Denver in winter (UTC-7): Tue–Sat 11:30 AM – 10 PM, Friday until 1 AM Saturday, closed Sunday and Monday.
const denver: OpeningHours = {
  periods: [
    { open: p(2, 11, 30), close: p(2, 22) },
    { open: p(3, 11, 30), close: p(3, 22) },
    { open: p(4, 11, 30), close: p(4, 22) },
    { open: p(5, 11, 30), close: p(6, 1) },
    { open: p(6, 11, 30), close: p(6, 22) },
  ],
  weekday: [],
  utc_offset_minutes: -420,
};
// 2026-11-17 is a Tuesday. Local Denver time = UTC - 7h.
const at = (iso: string) => new Date(iso);

describe('clock', () => {
  it('formats 12-hour times', () => {
    expect(clock(p(0, 0))).toBe('12 AM');
    expect(clock(p(0, 11, 30))).toBe('11:30 AM');
    expect(clock(p(0, 12))).toBe('12 PM');
    expect(clock(p(0, 22, 5))).toBe('10:05 PM');
    expect(clock(p(0, 24))).toBe('12 AM');
  });
});

describe('openStatus', () => {
  it('is open during a period, in the restaurant’s time zone', () => {
    // 20:00 UTC Tue = 1 PM Tue in Denver
    expect(openStatus(denver, at('2026-11-17T20:00:00Z'))).toEqual({
      open: true,
      text: 'Open · until 10 PM',
      spoken: 'Open now, until 10 PM',
    });
  });

  it('says when it opens later today', () => {
    // 15:00 UTC Tue = 8 AM Tue in Denver
    expect(openStatus(denver, at('2026-11-17T15:00:00Z'))?.text).toBe('Closed · opens 11:30 AM');
  });

  it('names the day when the next opening is another day', () => {
    // 06:00 UTC Wed = 11 PM Tue in Denver
    expect(openStatus(denver, at('2026-11-18T06:00:00Z'))).toEqual({
      open: false,
      text: 'Closed · opens Wed 11:30 AM',
      spoken: 'Closed now, opens Wednesday 11:30 AM',
    });
    // Sunday noon in Denver: next is Tuesday
    expect(openStatus(denver, at('2026-11-22T19:00:00Z'))?.text).toBe('Closed · opens Tue 11:30 AM');
  });

  it('handles a period that runs past midnight', () => {
    // 07:30 UTC Sat = 12:30 AM Sat in Denver, inside Friday's period
    expect(openStatus(denver, at('2026-11-21T07:30:00Z'))?.text).toBe('Open · until 1 AM');
  });

  it('handles a period that wraps the week (Saturday night into Sunday)', () => {
    const late: OpeningHours = { periods: [{ open: p(6, 20), close: p(0, 2) }], weekday: [], utc_offset_minutes: 0 };
    expect(openStatus(late, at('2026-11-22T01:00:00Z'))?.open).toBe(true); // Sunday 1 AM
    expect(openStatus(late, at('2026-11-21T21:00:00Z'))?.open).toBe(true); // Saturday 9 PM
    expect(openStatus(late, at('2026-11-22T03:00:00Z'))?.open).toBe(false);
  });

  it('knows Google’s open-24-hours shape', () => {
    const always: OpeningHours = { periods: [{ open: p(0, 0) }], weekday: [], utc_offset_minutes: null };
    expect(openStatus(always)?.text).toBe('Open 24 hours');
  });

  it('says nothing without periods or an offset', () => {
    expect(openStatus(null)).toBeNull();
    expect(openStatus({ periods: [], weekday: ['Monday: Closed'], utc_offset_minutes: 0 })).toBeNull();
    expect(openStatus({ ...denver, utc_offset_minutes: null })).toBeNull();
  });
});

describe('todayIndex', () => {
  it('is Monday-first, in the restaurant’s time zone', () => {
    expect(todayIndex(denver, at('2026-11-17T20:00:00Z'))).toBe(1); // Tuesday
    expect(todayIndex(denver, at('2026-11-17T03:00:00Z'))).toBe(0); // still Monday evening in Denver
    expect(todayIndex({ ...denver, utc_offset_minutes: null })).toBeNull();
  });
});

describe('googleRating', () => {
  it('shows the score and review count, and speaks them in words', () => {
    expect(googleRating(4.6, 2310)).toEqual({
      text: '4.6 ★ (2,310)',
      spoken: 'Google rating 4.6 out of 5, 2,310 reviews',
    });
    expect(googleRating(5, 1)?.spoken).toBe('Google rating 5.0 out of 5, 1 review');
    expect(googleRating(4, null)?.text).toBe('4.0 ★');
    expect(googleRating(null, 10)).toBeNull();
  });
});
