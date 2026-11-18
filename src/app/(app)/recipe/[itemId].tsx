import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { CheckRow } from '@/components/check-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { fetchRecipes } from '@/lib/data';
import { recipesLabel } from '@/lib/shopping-list';
import { toggleRecipe, useShoppingSelection } from '@/lib/shopping-selection';

/** One saved recipe's ingredients and steps (HAN-74), as read from its post. Opened from "Recipe ›" on a card. */
export default function RecipeScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const recipe = useAsync(async () => (await fetchRecipes([itemId]))[0] ?? null, [itemId]);
  const data = recipe.data;
  const { ids } = useShoppingSelection();
  const picked = ids.includes(itemId);
  const theme = useTheme();

  const toggle = () => {
    toggleRecipe(itemId);
    const count = picked ? ids.length - 1 : ids.length + 1;
    announce(`${picked ? 'Removed from' : 'Added to'} shopping list. ${recipesLabel(count)}.`);
  };

  return (
    <Screen
      edges="none"
      footer={
        ids.length ? (
          <Button
            title={`Shopping list · ${recipesLabel(ids.length)}`}
            size="large"
            onPress={() => router.push('/shopping-list')}
          />
        ) : null
      }>
      <Stack.Screen options={{ title: data?.name ?? '' }} />
      {recipe.error ? (
        <ThemedText themeColor="danger" accessibilityRole="alert">
          {recipe.error.message}
        </ThemedText>
      ) : null}
      {recipe.loading && !recipe.data ? <ActivityIndicator accessibilityLabel="Loading recipe" /> : null}
      {data === null ? <ThemedText themeColor="textSecondary">This recipe was deleted.</ThemedText> : null}
      {data ? (
        <>
          <View style={styles.head}>
            <ThemedText type="sectionTitle" accessibilityRole="header">
              {data.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Recipes › {data.list.name}
            </ThemedText>
            {data.description ? <ThemedText type="small">{data.description}</ThemedText> : null}
          </View>
          <CheckRow checked={picked} onPress={toggle} accessibilityLabel={`Add ${data.name} to shopping list`}>
            <ThemedText type="defaultBold">{picked ? 'On your shopping list' : 'Add to shopping list'}</ThemedText>
          </CheckRow>
          {data.ingredients.length ? (
            <View style={styles.section}>
              <ThemedText type="defaultBold" accessibilityRole="header">
                Ingredients
              </ThemedText>
              <View accessibilityRole="list">
                {data.ingredients.map((line, i) => (
                  <ThemedText key={i} selectable style={styles.line} accessibilityLabel={line}>
                    • {line}
                  </ThemedText>
                ))}
              </View>
            </View>
          ) : null}
          {data.steps.length ? (
            <View style={styles.section}>
              <ThemedText type="defaultBold" accessibilityRole="header">
                Steps
              </ThemedText>
              <View accessibilityRole="list">
                {data.steps.map((step, i) => (
                  <ThemedText key={i} selectable style={styles.line} accessibilityLabel={`Step ${i + 1}: ${step}`}>
                    {i + 1}. {step}
                  </ThemedText>
                ))}
              </View>
            </View>
          ) : null}
          {!data.ingredients.length && !data.steps.length ? (
            <ThemedText themeColor="textSecondary">
              No ingredients or steps were found in this post. The source post may have them.
            </ThemedText>
          ) : null}
          {data.link_id ? (
            <Pressable
              onPress={() => router.push({ pathname: '/card/[linkId]', params: { linkId: data.link_id! } })}
              accessibilityRole="button"
              accessibilityLabel={`Source post for ${data.name}`}
              style={styles.link}>
              <ThemedText type="small" style={{ color: theme.link }}>
                Source post ›
              </ThemedText>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.one },
  section: { gap: Spacing.two },
  line: { paddingVertical: Spacing.half },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
