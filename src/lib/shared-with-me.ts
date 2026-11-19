import { useSyncExternalStore } from 'react';

import { fetchSharedWithMe, markSharesSeen, type SharedWithMe } from '@/lib/data';
import { sharerName } from '@/lib/display-name';
import { toError } from '@/lib/errors';

/**
 * "Shared with me" (HAN-71): one copy of the signed-in user's shared lists, read by the Home row, the /shared screen
 * and the new-share popup, so marking a share seen in one place updates the others.
 */
type State = { data: SharedWithMe[] | undefined; error: Error | undefined; loading: boolean };

let state: State = { data: undefined, error: undefined, loading: false };
let generation = 0;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Refetches; a reset (sign-out) while it runs drops the result. Resolves to the new rows, or undefined on error. */
export async function refreshSharedWithMe(): Promise<SharedWithMe[] | undefined> {
  const run = generation;
  set({ loading: true });
  try {
    const data = await fetchSharedWithMe();
    if (run !== generation) return undefined;
    set({ data, error: undefined, loading: false });
    return data;
  } catch (e) {
    if (run === generation) set({ error: toError(e), loading: false });
    return undefined;
  }
}

/** Marks shares seen in the database, then locally. Failures are left for the next launch to retry. */
export async function markSeen(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  await markSharesSeen(tokens);
  const now = new Date().toISOString();
  if (state.data) set({ data: state.data.map((s) => (tokens.includes(s.token) && !s.seen_at ? { ...s, seen_at: now } : s)) });
}

/** Forgets the current user's shares, e.g. when the signed-in group unmounts. */
export function resetSharedWithMe() {
  generation++;
  set({ data: undefined, error: undefined, loading: false });
}

export const sharedWithMeSnapshot = () => state;

export function useSharedWithMe(): State & { refresh: typeof refreshSharedWithMe } {
  const s = useSyncExternalStore(subscribe, sharedWithMeSnapshot, sharedWithMeSnapshot);
  return { ...s, refresh: refreshSharedWithMe };
}

export const unseen = (rows: SharedWithMe[] | undefined) => rows?.filter((s) => !s.seen_at) ?? [];

export const listTitle = (s: Pick<SharedWithMe, 'category' | 'list'>) => `${s.category} › ${s.list}`;

/** What the new-share popup says for these unseen shares, or null when there's nothing new. */
export function newSharePrompt(fresh: SharedWithMe[]): { message: string; token: string | null } | null {
  if (!fresh.length) return null;
  if (fresh.length === 1) {
    const [s] = fresh;
    return { message: `${sharerName(s.shared_by)} shared ${listTitle(s)} with you`, token: s.token };
  }
  return { message: `${fresh.length} lists were shared with you`, token: null };
}
