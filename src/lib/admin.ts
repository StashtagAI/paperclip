import { toError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/**
 * Admin portal (HAN-128). Who is an admin is decided in Postgres (admin_users, bound to account ids), and
 * admin_stats() refuses everyone else, so hiding the Profile row is only a convenience.
 */

/** Shape returned by public.admin_stats() (supabase/migrations/20261123232831_admin_portal.sql). */
export type AdminStats = {
  generated_at: string;
  users: { total: number; new_7d: number; new_30d: number; signed_in_7d: number };
  active: { d1: number; d7: number; d30: number };
  stashes: {
    d1: number;
    d7: number;
    d30: number;
    total: number;
    done_30d: number;
    failed_30d: number;
    in_progress: number;
    not_sorted_30d: number;
    instagram_30d: number;
    tiktok_30d: number;
    median_seconds_30d: number | null;
  };
  failures_30d: { error: string; count: number }[];
  items: { total: number; d7: number; from_links_30d: number };
  costs: {
    today: number;
    d1: number;
    d7: number;
    d30: number;
    total: number;
    process_link_30d: number;
    process_link_runs_30d: number;
    place_details_30d: number;
    apify_30d: number;
    video_30d: number;
    claude_calls_30d: number;
    input_tokens_30d: number;
    output_tokens_30d: number;
    web_searches_30d: number;
    places_calls_30d: number;
    geocode_calls_30d: number;
  };
  limits_7d: { refused_runs: number; alerts: number };
  engagement: {
    thumbs_up_30d: number;
    thumbs_down_30d: number;
    feedback_new: number;
    feedback_7d: number;
    shared_lists: number;
    waitlist_total: number;
    waitlist_7d: number;
  };
  daily: { day: string; stashes: number; new_users: number; usd: number }[];
};

export const NOT_ADMIN = 'not_admin';

export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw toError(error);
  return data === true;
}

/** Throws an Error with code NOT_ADMIN when the signed-in account isn't an admin. */
export async function fetchAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_stats');
  if (error) {
    const e = toError(error);
    if (error.code === '42501') Object.assign(e, { code: NOT_ADMIN });
    throw e;
  }
  return data as AdminStats;
}

export const isNotAdmin = (e: Error | undefined) => (e as { code?: string } | undefined)?.code === NOT_ADMIN;

/** Postgres numerics arrive as numbers or strings; anything else is unknown. */
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export function formatCount(v: unknown): string {
  const n = num(v);
  return n === null ? 'Unavailable' : Math.round(n).toLocaleString('en-US');
}

/** Cents for anything a dollar or more; a tenth of a cent below that, so small daily costs don't show as $0.00. */
export function formatUsd(v: unknown): string {
  const n = num(v);
  if (n === null) return 'Unavailable';
  if (n === 0) return '$0.00';
  if (Math.abs(n) < 1) return `$${n.toFixed(3)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "12%" of a whole, or "None yet" with nothing to divide by. */
export function formatShare(part: unknown, whole: unknown): string {
  const p = num(part);
  const w = num(whole);
  if (p === null || w === null) return 'Unavailable';
  if (w === 0) return 'None yet';
  return `${Math.round((p / w) * 100)}%`;
}

/** Spend ÷ count, e.g. average cost per stash; "None yet" when the count is zero. */
export function formatUsdPer(usd: unknown, count: unknown): string {
  const u = num(usd);
  const c = num(count);
  if (u === null || c === null) return 'Unavailable';
  if (c === 0) return 'None yet';
  return formatUsd(u / c);
}

export function formatSeconds(v: unknown): string {
  const n = num(v);
  if (n === null) return 'None yet';
  if (n < 60) return `${Math.round(n)} s`;
  return `${Math.floor(n / 60)} min ${Math.round(n % 60)} s`;
}

/** Large token counts read better as "1.2M" / "34K". */
export function formatCompact(v: unknown): string {
  const n = num(v);
  if (n === null) return 'Unavailable';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  return formatCount(n);
}

/** "Mon 23 Nov" for a YYYY-MM-DD UTC day. */
export function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** links.error codes are shown raw on purpose: admins look them up in process-link. */
export const failureLabel = (code: string) => (code === 'unknown' ? 'No reason recorded' : code);
