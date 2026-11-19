import type { OpeningHours } from '@/lib/types';

const WEEK = 7 * 24 * 60;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Point = { day: number; hour: number; minute: number };
const minuteOfWeek = (p: Point) => p.day * 24 * 60 + p.hour * 60 + p.minute;

/** The restaurant's own clock, from the UTC offset Google gave (it's refreshed weekly, so DST catches up). */
function localNow(hours: OpeningHours, now: Date): { minute: number; day: number } | null {
  if (hours.utc_offset_minutes == null) return null;
  const local = new Date(now.getTime() + hours.utc_offset_minutes * 60_000);
  return { day: local.getUTCDay(), minute: local.getUTCDay() * 24 * 60 + local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** "10 PM", "11:30 AM", "12 AM" for midnight. */
export function clock(p: { hour: number; minute: number }): string {
  const h = p.hour % 24;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return p.minute ? `${h12}:${String(p.minute).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export type OpenStatus = { open: boolean; text: string; spoken: string };

/**
 * "Open · until 10 PM", "Closed · opens 11:30 AM", "Closed · opens Tue 5 PM" or "Open 24 hours", in the restaurant's
 * time zone. Null when Google gave no periods or no UTC offset, rather than guess.
 */
export function openStatus(hours: OpeningHours | null | undefined, now: Date = new Date()): OpenStatus | null {
  if (!hours?.periods.length) return null;
  const { periods } = hours;
  // Google's "always open": one period opening Sunday midnight that never closes.
  if (periods.length === 1 && !periods[0].close && minuteOfWeek(periods[0].open) === 0) {
    return { open: true, text: 'Open 24 hours', spoken: 'Open 24 hours' };
  }
  const t = localNow(hours, now);
  if (!t) return null;
  for (const p of periods) {
    if (!p.close) continue;
    const start = minuteOfWeek(p.open);
    let end = minuteOfWeek(p.close);
    if (end <= start) end += WEEK; // closes after the week wraps, e.g. Saturday 6 PM – Sunday 2 AM
    for (const m of [t.minute, t.minute + WEEK]) {
      if (m >= start && m < end) {
        const until = `until ${clock(p.close)}`;
        return { open: true, text: `Open · ${until}`, spoken: `Open now, ${until}` };
      }
    }
  }
  const next = periods
    .map((p) => ({ p: p.open, wait: (minuteOfWeek(p.open) - t.minute + WEEK) % WEEK }))
    .sort((a, b) => a.wait - b.wait)[0];
  if (!next) return { open: false, text: 'Closed', spoken: 'Closed now' };
  const sameDay = next.p.day === t.day && next.wait < 24 * 60;
  const when = sameDay ? clock(next.p) : `${DAYS[next.p.day]} ${clock(next.p)}`;
  const spokenWhen = sameDay ? clock(next.p) : `${DAY_NAMES[next.p.day]} ${clock(next.p)}`;
  return { open: false, text: `Closed · opens ${when}`, spoken: `Closed now, opens ${spokenWhen}` };
}

/** Google's day lines run Monday to Sunday; the index of today's, in the restaurant's time zone. */
export function todayIndex(hours: OpeningHours, now: Date = new Date()): number | null {
  const t = localNow(hours, now);
  return t ? (t.day + 6) % 7 : null;
}

/** "4.6 ★ (2,310)" on the card, and what a screen reader says instead. */
export function googleRating(rating: number | null, count: number | null): { text: string; spoken: string } | null {
  if (rating == null) return null;
  const r = rating.toFixed(1);
  const n = count != null ? count.toLocaleString('en-US') : null;
  return {
    text: n ? `${r} ★ (${n})` : `${r} ★`,
    spoken: `Google rating ${r} out of 5${n ? `, ${n} ${count === 1 ? 'review' : 'reviews'}` : ''}`,
  };
}
