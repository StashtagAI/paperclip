import type { Offer } from '@/lib/purchases-shared';

export { ENTITLEMENT, type Offer, type Period } from '@/lib/purchases-shared';

// Web (HAN-132): Premium is bought in the iOS or Android app (in-app purchase). A Premium account works on the web too,
// since the server holds the plan; the web paywall just has nothing to sell.
export const storeAvailable = false;
export const storeName = 'App Store';
export const manageSubscriptionsUrl = 'https://apps.apple.com/account/subscriptions';

const unavailable = () => Promise.reject(new Error('Get Premium in the Stashtag app on your phone.'));

export const loadOffers = (_userId: string): Promise<Offer[]> => unavailable();
export const buy = (_userId: string, _offer: Offer): Promise<'done' | 'cancelled'> => unavailable();
export const restore = (_userId: string): Promise<boolean> => unavailable();
export const willRenew = async (_userId: string): Promise<boolean | null> => null;
