import { supabase } from '@/lib/supabase';

// Free and Premium (HAN-132). The server decides: my_plan reads public.entitlements and the month's stash count, and
// process-link enforces the same numbers. Nothing here unlocks anything.

export type Plan = {
  plan: 'free' | 'premium';
  source: 'revenuecat' | 'manual' | null;
  /** When Premium ends or renews; null for a free plan or a grant with no end date. */
  expires_at: string | null;
  stashes_used: number;
  stash_limit: number;
  free_stash_limit: number;
  /** Start of next month, UTC: the allowance resets then. */
  resets_at: string;
  shared_lists: number;
  shared_list_limit: number;
  free_shared_list_limit: number;
  /** Longest video process-link reads on this plan, and on each plan (HAN-126). Absent before that migration. */
  video_seconds?: number;
  free_video_seconds?: number;
  premium_video_seconds?: number;
  custom_organization: boolean;
};

export async function fetchPlan(): Promise<Plan> {
  const { data, error } = await supabase.rpc('my_plan');
  if (error) throw error;
  return data as Plan;
}

/** Asks the server to re-read the store (via RevenueCat) after a purchase or restore. */
export async function syncPlan(): Promise<void> {
  const { error } = await supabase.functions.invoke('entitlements', { body: {} });
  if (error) throw error;
}

/**
 * The prices the board approved on HAN-127, shown only while the store has no products to sell (before launch, web).
 * Once the store answers, its own localized price is what's shown and charged.
 */
export const PLANNED_PRICES = { monthly: 4.99, annual: 34.99, currency: 'USD', trialDays: 7 } as const;

export const TERMS_URL = 'https://stashtag.ai/terms/';
export const PRIVACY_URL = 'https://stashtag.ai/privacy/';

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** How much cheaper a year is than twelve months, as a whole percentage (34.99 vs 4.99 → 42). */
export function annualSavingsPercent(monthly: number, annual: number): number {
  if (!(monthly > 0) || !(annual > 0)) return 0;
  return Math.max(0, Math.floor((1 - annual / (monthly * 12)) * 100));
}

/** "Dec 1": the reset is midnight UTC, so the date is shown in UTC too (it's still Nov 30 in the evening in the US). */
export function resetDate(resetsAt: string): string {
  return new Date(resetsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const stashesLeft = (p: Pick<Plan, 'stashes_used' | 'stash_limit'>) => Math.max(0, p.stash_limit - p.stashes_used);

/** One line about this month's AI stashes, for Profile and the paywall. */
export function allowanceLine(p: Plan): string {
  if (p.plan === 'premium') {
    // The fair-use ceiling only comes up when someone gets near it.
    return p.stashes_used >= p.stash_limit * 0.8
      ? `${p.stashes_used} of ${p.stash_limit} AI stashes this month (fair use). Resets ${resetDate(p.resets_at)}.`
      : 'Unlimited AI stashes.';
  }
  const left = stashesLeft(p);
  const when = `Resets ${resetDate(p.resets_at)}.`;
  if (left === 0) return `You’ve used all ${p.stash_limit} free AI stashes this month. ${when}`;
  return `${p.stashes_used} of ${p.stash_limit} free AI stashes used this month. ${when}`;
}

/** The plan name and when it ends, for Profile's Billing row. */
export function planTitle(p: Plan): string {
  return p.plan === 'premium' ? 'Premium' : 'Free plan';
}

export function premiumUntil(p: Plan): string | null {
  if (p.plan !== 'premium') return null;
  if (!p.expires_at) return p.source === 'manual' ? 'Premium is on for this account.' : null;
  const date = new Date(p.expires_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `Paid through ${date}.`;
}

/** 150 → "2:30", 90 → "1:30", 115.4 → "1:55". */
export function clockLength(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Spoken form: VoiceOver reads "2:30" as a time of day. 150 → "2 minutes 30 seconds". */
export function spokenLength(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (!m) return part(r, 'second');
  return r ? `${part(m, 'minute')} ${part(r, 'second')}` : part(m, 'minute');
}

type VideoFetch = { video_skip?: string; video_sec?: number | null; video_max_sec?: number; video_premium_max_sec?: number };

/**
 * HAN-126: what the capture screen says when process-link skipped a reel for being longer than the plan reads, and
 * whether Premium would have read it. Null when the video wasn't skipped for length.
 */
export function videoTooLong(f: VideoFetch | undefined): { text: string; spoken: string; premiumWouldRead: boolean } | null {
  if (f?.video_skip !== 'too_long' || !f.video_max_sec) return null;
  const sec = f.video_sec ?? null;
  const premium = f.video_premium_max_sec;
  const premiumWouldRead = !!premium && premium > f.video_max_sec && (sec == null || sec <= premium);
  const say = (fmt: (n: number) => string) => {
    const len = sec ? ` (${fmt(sec)})` : '';
    return (
      `This video${len} is longer than the ${fmt(f.video_max_sec!)} we can read automatically. ` +
      'Record your screen while it plays, then add the recording below. We’ll read it on this phone.' +
      (premiumWouldRead ? ` Premium reads videos up to ${fmt(premium!)}.` : '')
    );
  };
  return { text: say(clockLength), spoken: say(spokenLength), premiumWouldRead };
}
