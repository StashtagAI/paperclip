/**
 * Feature flags. Flip in code; there is no remote config for the beta.
 */
export const Features = {
  /** "Shared" stashes with a partner or group: a later Premium-tier feature (HAN-10), hidden for the MVP. */
  shared: false,
  /**
   * Buy buttons on Shop items and Send to Instacart on recipes and the shopping list (HAN-131), for free and Premium
   * alike. Off until the affiliate programs approve the app: set EXPO_PUBLIC_SHOP_LINKS=1 to try it in a build.
   */
  shopLinks: process.env.EXPO_PUBLIC_SHOP_LINKS === '1',
} as const;
