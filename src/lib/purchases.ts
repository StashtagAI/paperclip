import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { ENTITLEMENT, type Offer, type Period } from '@/lib/purchases-shared';

export { ENTITLEMENT, type Offer, type Period } from '@/lib/purchases-shared';

// Premium is sold through App Store / Google Play in-app purchase, via RevenueCat (HAN-132). The RevenueCat public SDK
// keys are EXPO_PUBLIC_*: they can only start purchases, never grant Premium. The server re-reads RevenueCat with its
// secret key (entitlements function) before anything unlocks. Without a key (before the board sets up the products)
// the store is off and the paywall shows the planned prices with buying turned off.
const KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

export const storeAvailable = !!KEY;
export const storeName = Platform.OS === 'android' ? 'Google Play' : 'App Store';
export const manageSubscriptionsUrl =
  Platform.OS === 'android' ? 'https://play.google.com/store/account/subscriptions' : 'https://apps.apple.com/account/subscriptions';

let configuredFor: string | null = null;

/** The SDK is tied to the signed-in account (app user id = Supabase user id), so purchases follow the account. */
async function ready(userId: string) {
  if (!KEY) throw new Error('Premium isn’t on sale yet.');
  if (!configuredFor) {
    Purchases.configure({ apiKey: KEY, appUserID: userId });
  } else if (configuredFor !== userId) {
    await Purchases.logIn(userId);
  }
  configuredFor = userId;
}

const UNIT: Record<string, string> = { DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' };

function trialOf(pkg: PurchasesPackage): string | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const unit = UNIT[intro.periodUnit] ?? intro.periodUnit.toLowerCase();
  return `${intro.periodNumberOfUnits}-${unit} free trial`;
}

function offerOf(period: Period, pkg: PurchasesPackage | null | undefined): Offer | null {
  if (!pkg) return null;
  return {
    period,
    price: pkg.product.priceString,
    amount: pkg.product.price,
    currency: pkg.product.currencyCode,
    trial: trialOf(pkg),
    ref: pkg,
  };
}

/** The annual and monthly packages of RevenueCat's current offering, annual first. */
export async function loadOffers(userId: string): Promise<Offer[]> {
  await ready(userId);
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  return [offerOf('annual', current?.annual), offerOf('monthly', current?.monthly)].filter((o): o is Offer => !!o);
}

/** Buys a package. 'cancelled' when the person closed the store sheet. */
export async function buy(userId: string, offer: Offer): Promise<'done' | 'cancelled'> {
  await ready(userId);
  try {
    await Purchases.purchasePackage(offer.ref as PurchasesPackage);
    return 'done';
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
    throw e;
  }
}

/** Restores earlier purchases on this store account. True when Premium came back. */
export async function restore(userId: string): Promise<boolean> {
  await ready(userId);
  const info = await Purchases.restorePurchases();
  return !!info.entitlements.active[ENTITLEMENT];
}

/** Whether the store says the current Premium subscription renews (false after cancelling). Null when unknown. */
export async function willRenew(userId: string): Promise<boolean | null> {
  if (!KEY) return null;
  try {
    await ready(userId);
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT]?.willRenew ?? null;
  } catch {
    return null;
  }
}
