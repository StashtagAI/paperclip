// Shared by purchases.ts (iOS/Android) and purchases.web.ts (HAN-132).

/** The RevenueCat entitlement identifier that unlocks Premium; the entitlements function checks the same one. */
export const ENTITLEMENT = 'premium';

export type Period = 'annual' | 'monthly';

export type Offer = {
  period: Period;
  /** The store's localized price, e.g. "$34.99". */
  price: string;
  amount: number;
  currency: string;
  /** "7-day free trial" when the store offers a free introductory period. */
  trial: string | null;
  /** The store package to buy; opaque outside purchases.ts. */
  ref: unknown;
};
