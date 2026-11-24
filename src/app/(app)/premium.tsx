import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { useAuth } from '@/lib/auth';
import {
  allowanceLine,
  annualSavingsPercent,
  clockLength,
  fetchPlan,
  formatPrice,
  PLANNED_PRICES,
  premiumUntil,
  PRIVACY_URL,
  spokenLength,
  syncPlan,
  TERMS_URL,
  type Plan,
} from '@/lib/plan';
import { buy, loadOffers, manageSubscriptionsUrl, restore, storeAvailable, storeName, willRenew, type Offer, type Period } from '@/lib/purchases';

type Choice = { period: Period; price: string; amount: number; currency: string; trial: string | null; offer: Offer | null };

/** The store's packages, or the planned prices while there is nothing to buy (no products yet, web). */
function choices(offers: Offer[] | undefined): Choice[] {
  if (offers?.length) return offers.map((o) => ({ ...o, offer: o }));
  const { annual, monthly, currency, trialDays } = PLANNED_PRICES;
  const trial = `${trialDays}-day free trial`;
  return [
    { period: 'annual', price: formatPrice(annual, currency), amount: annual, currency, trial, offer: null },
    { period: 'monthly', price: formatPrice(monthly, currency), amount: monthly, currency, trial, offer: null },
  ];
}

const PER: Record<Period, string> = { annual: 'year', monthly: 'month' };

/**
 * Premium paywall (HAN-132): one plan, monthly or annual (annual selected first). Bought with in-app purchase through
 * RevenueCat; the server re-reads the store before Premium turns on (entitlements function).
 */
export default function PremiumScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const plan = useAsync(fetchPlan, []);
  const offers = useAsync(async () => (storeAvailable && userId ? loadOffers(userId) : []), [userId]);
  const [period, setPeriod] = useState<Period>('annual');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const list = choices(offers.data);
  const selected = list.find((c) => c.period === period) ?? list[0];
  const monthly = list.find((c) => c.period === 'monthly');
  const annual = list.find((c) => c.period === 'annual');
  const savings = monthly && annual && monthly.currency === annual.currency ? annualSavingsPercent(monthly.amount, annual.amount) : 0;
  const canBuy = !!selected?.offer && !busy;
  const premium = plan.data?.plan === 'premium';

  function say(text: string, error = false) {
    setStatus({ text, error });
    announce(text);
  }

  const offersError = offers.error ? `Couldn’t load prices from the ${storeName}: ${offers.error.message}` : null;
  useEffect(() => {
    if (offersError) announce(offersError);
  }, [offersError]);

  /** After the store says yes: the server checks with RevenueCat, then the plan is re-read. */
  async function confirmWithServer(): Promise<Plan | undefined> {
    await syncPlan();
    const next = await fetchPlan();
    plan.update(() => next);
    return next;
  }

  async function subscribe() {
    if (!selected?.offer) return;
    setBusy('buy');
    say(`Opening the ${storeName}…`);
    try {
      const result = await buy(userId, selected.offer);
      if (result === 'cancelled') {
        say('Purchase cancelled. Nothing was charged.');
        return;
      }
      say('Turning on Premium…');
      const next = await confirmWithServer();
      if (next?.plan === 'premium') {
        say('Premium is on. Thanks for supporting Stashtag!');
        toast('Premium is on');
      } else {
        say('The purchase went through, but Premium isn’t showing yet. Wait a minute, then tap Restore purchases.', true);
      }
    } catch (e) {
      say(`Couldn’t complete the purchase: ${(e as Error).message}`, true);
    } finally {
      setBusy(null);
    }
  }

  async function restoreNow() {
    setBusy('restore');
    say('Restoring purchases…');
    try {
      const found = await restore(userId);
      const next = await confirmWithServer();
      say(next?.plan === 'premium' ? 'Premium restored.' : found ? 'Found a purchase, but Premium isn’t showing yet. Try again in a minute.' : 'No Premium purchase found for this store account.', !found);
    } catch (e) {
      say(`Couldn’t restore purchases: ${(e as Error).message}`, true);
    } finally {
      setBusy(null);
    }
  }

  const buyTitle = !selected
    ? 'Subscribe'
    : selected.trial
      ? `Start ${selected.trial}`
      : `Subscribe for ${selected.price}/${PER[selected.period]}`;

  return (
    <Screen
      edges="none"
      footer={
        premium || plan.loading ? null : (
          <View style={styles.footer}>
            <Button
              title={buyTitle}
              size="large"
              disabled={!canBuy}
              loading={busy === 'buy'}
              accessibilityHint={canBuy ? `Opens the ${storeName} to confirm` : undefined}
              onPress={subscribe}
            />
            {!storeAvailable || (offers.data && !offers.data.length) ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {storeAvailable ? 'Premium isn’t on sale yet. Prices shown are planned.' : 'Premium isn’t on sale in this version yet. Prices shown are planned.'}
              </ThemedText>
            ) : null}
          </View>
        )
      }>
      {plan.error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          Couldn’t load your plan: {plan.error.message}
        </ThemedText>
      ) : null}

      {premium && plan.data ? (
        <PremiumActive plan={plan.data} userId={userId} />
      ) : (
        <>
          <ThemedText type="title" accessibilityRole="header">
            Stash without limits
          </ThemedText>
          {plan.data ? <ThemedText themeColor="textSecondary">{allowanceLine(plan.data)}</ThemedText> : null}

          <View style={styles.perks}>
            <Perk title="Unlimited AI stashes" detail={`Free includes ${plan.data?.free_stash_limit ?? 15} a month. Fair use applies.`} />
            <Perk title="Share more lists at once" detail={`Free shares up to ${plan.data?.free_shared_list_limit ?? 5} lists at a time.`} />
            {plan.data?.premium_video_seconds && plan.data.free_video_seconds ? (
              <Perk
                title="Reads longer videos"
                detail={`Reels up to ${clockLength(plan.data.premium_video_seconds)}. Free reads up to ${clockLength(plan.data.free_video_seconds)}.`}
                spokenDetail={`Reels up to ${spokenLength(plan.data.premium_video_seconds)}. Free reads up to ${spokenLength(plan.data.free_video_seconds)}.`}
              />
            ) : null}
            <Perk title="Custom organization" detail="New ways to arrange your lists, as they arrive." />
            <Perk title="Everything in Free" detail="Sharing, shopping lists and Buy buttons stay free." />
          </View>

          <View accessibilityRole="radiogroup" accessibilityLabel="Billing period" style={styles.choices}>
            {offers.loading && storeAvailable ? <ActivityIndicator accessibilityLabel={`Loading prices from the ${storeName}`} /> : null}
            {list.map((c) => {
              const on = c.period === selected?.period;
              const perMonth = c.period === 'annual' ? `${formatPrice(c.amount / 12, c.currency)}/month, billed yearly` : 'Billed monthly';
              const badge = c.period === 'annual' && savings > 0 ? `Best value, save ${savings}%` : null;
              return (
                <Pressable
                  key={c.period}
                  accessibilityRole="radio"
                  aria-checked={on}
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${c.period === 'annual' ? 'Annual' : 'Monthly'}, ${c.price} a ${PER[c.period]}. ${perMonth}.${badge ? ` ${badge}.` : ''}${c.trial ? ` ${c.trial}.` : ''}`}
                  onPress={() => setPeriod(c.period)}
                  style={({ pressed }) => [
                    styles.choice,
                    {
                      backgroundColor: on ? theme.backgroundSelected : theme.backgroundElement,
                      borderColor: on ? theme.tint : theme.border,
                      borderWidth: on ? 2 : StyleSheet.hairlineWidth * 2,
                    },
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.choiceText}>
                    <ThemedText type="defaultBold">
                      {on ? '✓ ' : ''}
                      {c.period === 'annual' ? 'Annual' : 'Monthly'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {perMonth}
                    </ThemedText>
                    {badge ? <ThemedText type="smallBold">{badge}</ThemedText> : null}
                  </View>
                  <ThemedText type="defaultBold">
                    {c.price}/{PER[c.period]}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {selected ? (
            <ThemedText type="small" themeColor="textSecondary">
              {selected.trial ? `${selected.trial}, then ` : ''}
              {selected.price} a {PER[selected.period]}. Renews automatically until you cancel. Cancel anytime in your{' '}
              {storeName} settings at least 24 hours before it renews.
            </ThemedText>
          ) : null}

          {storeAvailable ? (
            <Button title="Restore purchases" variant="secondary" loading={busy === 'restore'} disabled={!!busy} onPress={restoreNow} />
          ) : null}
        </>
      )}

      {/* Spoken on iOS by announce(); Android and web read the live region. */}
      <View accessibilityLiveRegion="polite">
        {offersError ? (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {offersError}
          </ThemedText>
        ) : null}
        {status ? (
          <ThemedText type="small" themeColor={status.error ? 'danger' : 'textSecondary'} accessibilityRole={status.error ? 'alert' : undefined}>
            {status.text}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.links}>
        <Button title="Terms of Service" variant="secondary" accessibilityRole="link" onPress={() => Linking.openURL(TERMS_URL)} />
        <Button title="Privacy Policy" variant="secondary" accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)} />
      </View>
    </Screen>
  );
}

/** spokenDetail: for VoiceOver when detail has something it misreads (it says "2:30" as a time of day). */
function Perk({ title, detail, spokenDetail }: { title: string; detail: string; spokenDetail?: string }) {
  return (
    <View accessible accessibilityLabel={`${title}. ${spokenDetail ?? detail}`} style={styles.perk}>
      <ThemedText type="defaultBold" importantForAccessibility="no">
        ✓ {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" importantForAccessibility="no">
        {detail}
      </ThemedText>
    </View>
  );
}

function PremiumActive({ plan, userId }: { plan: Plan; userId: string }) {
  const renew = useAsync(() => (plan.source === 'revenuecat' ? willRenew(userId) : Promise.resolve(null)), [plan.source, userId]);
  const until = premiumUntil(plan);
  return (
    <>
      <ThemedText type="title" accessibilityRole="header">
        You have Premium
      </ThemedText>
      <ThemedText themeColor="textSecondary">{allowanceLine(plan)}</ThemedText>
      {until ? (
        <ThemedText themeColor="textSecondary">
          {until}
          {renew.data === true ? ' Renews automatically.' : renew.data === false ? ' Won’t renew.' : ''}
        </ThemedText>
      ) : null}
      {plan.source === 'revenuecat' ? (
        <Button
          title="Manage subscription"
          variant="secondary"
          accessibilityRole="link"
          accessibilityHint={`Opens your ${storeName} subscriptions`}
          onPress={() => Linking.openURL(manageSubscriptionsUrl)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  footer: { gap: Spacing.two },
  center: { textAlign: 'center' },
  perks: { gap: Spacing.two },
  perk: { gap: Spacing.half },
  choices: { gap: Spacing.two },
  choice: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 64,
    padding: Spacing.three,
    borderRadius: Radius.row,
  },
  choiceText: { flexGrow: 1, flexShrink: 1, flexBasis: 160, gap: Spacing.half },
  pressed: { opacity: 0.8 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
