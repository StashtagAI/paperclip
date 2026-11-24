import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { KIND_LABELS, KINDS } from '@/lib/types';

export type TutorialStep = {
  title: string;
  body: string;
  /** Decorative; the title and body carry the meaning. */
  icon: { ios: string; android: string; web: string } | 'pin';
};

const kindList = (() => {
  const labels = KINDS.map((k) => KIND_LABELS[k]);
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
})();

/** "How StashtagAI works" (HAN-137). Same wording as the first-stash guide on Home where they overlap. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Welcome to StashtagAI',
    body: 'Save the places, recipes and finds you see on Instagram and TikTok. We turn each post into lists you’ll actually use.',
    icon: 'pin',
  },
  {
    title: 'Stash a post',
    body: 'In Instagram or TikTok, tap Share, then StashtagAI. Or copy the post’s link and tap Stash a link on Home.',
    icon: { ios: 'square.and.arrow.up', android: 'ios_share', web: 'ios_share' },
  },
  {
    title: 'We sort it for you',
    body: `We read the post and file what it names into ${kindList}, like Eats › Restaurants › Denver.`,
    icon: { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' },
  },
  {
    title: 'Sometimes we need a hand',
    body: 'If a post keeps the details in its video or pictures, we’ll ask for a screenshot or the caption. Check Recently stashed on Home.',
    icon: { ios: 'camera.viewfinder', android: 'screenshot', web: 'screenshot' },
  },
  {
    title: 'Use your stash',
    body: 'Search everything, tick off what you’ve tried, star favorites and share a list with a friend. Home suggests picks for tonight and near you.',
    icon: { ios: 'star', android: 'star', web: 'star' },
  },
];

export const stepLabel = (index: number) => `Step ${index + 1} of ${TUTORIAL_STEPS.length}`;

/** Per account, so a second account on the same phone gets its own first run. */
export const seenKey = (userId: string) => `stashtag.tutorialSeen.${userId}`;

/** Show it by itself only to a new account: never seen here, and nothing stashed yet. */
export function shouldAutoShow({ seen, stashEmpty }: { seen: boolean; stashEmpty: boolean }) {
  return !seen && stashEmpty;
}

// Open state lives outside React so Home (first run) and Profile ("How StashtagAI works") can both open the one popup.
let open = false;
let openFor: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openTutorial(userId: string | null) {
  open = true;
  openFor = userId;
  emit();
}

export function closeTutorial() {
  if (!open) return;
  open = false;
  // A failed write shows it once more next launch, which is fine.
  if (openFor) AsyncStorage.setItem(seenKey(openFor), '1').catch(() => {});
  openFor = null;
  emit();
}

export async function hasSeenTutorial(userId: string) {
  try {
    return (await AsyncStorage.getItem(seenKey(userId))) === '1';
  } catch {
    return true; // Can't tell: don't nag.
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useTutorialOpen() {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
