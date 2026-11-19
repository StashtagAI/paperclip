/**
 * The persistent bottom bar (HAN-91): Home, Shopping list, Nudges and Profile on every signed-in screen, so nobody is
 * ever stuck on a screen and the shopping list is one tap away in the store.
 */

export type Tab = 'home' | 'shopping' | 'nudges' | 'profile';

export const TAB_PATHS = {
  home: '/',
  shopping: '/shopping-list',
  nudges: '/nudges',
  profile: '/profile',
} as const satisfies Record<Tab, string>;

export const TAB_LABELS: Record<Tab, string> = {
  home: 'Home',
  shopping: 'Shopping',
  nudges: 'Nudges',
  profile: 'Profile',
};

/** Spoken names; the visible "Shopping" is short so four labels fit side by side at large text sizes. */
export const TAB_SPOKEN: Record<Tab, string> = {
  home: 'Home',
  shopping: 'Shopping list',
  nudges: 'Nudges',
  profile: 'Profile',
};

/** Nudges need geofencing and local notifications, which web doesn't have (HAN-43), so web shows three tabs. */
export function visibleTabs(nudgesSupported: boolean): Tab[] {
  return nudgesSupported ? ['home', 'shopping', 'nudges', 'profile'] : ['home', 'shopping', 'profile'];
}

/** The tab whose screen is showing, if any: a list or a card is "inside" Home but isn't Home itself. */
export function selectedTab(pathname: string): Tab | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const match = (Object.keys(TAB_PATHS) as Tab[]).find((tab) => TAB_PATHS[tab] === path);
  return match ?? null;
}

/**
 * What a tap does:
 * - `none`: already there.
 * - `home`: pop back to Home, dropping whatever was on top (the way out if a screen ever gets stuck).
 * - `root`: Profile is a top-level screen with no back button, so it opens straight over Home.
 * - `push`: Shopping list and Nudges open on top of the current screen, so back returns to the recipe you were on.
 */
export function tabAction(tab: Tab, pathname: string): 'none' | 'home' | 'root' | 'push' {
  if (selectedTab(pathname) === tab) return 'none';
  if (tab === 'home') return 'home';
  if (tab === 'profile') return 'root';
  return 'push';
}
