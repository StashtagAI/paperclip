import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function AppLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: theme.tint,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { color: theme.text },
        headerLargeTitleStyle: { color: theme.text },
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Your stash' }} />
      <Stack.Screen name="kind/[kind]" options={{ title: '', headerLargeTitle: true }} />
      <Stack.Screen name="list/[listId]" options={{ title: '' }} />
      <Stack.Screen
        name="stash"
        options={{ title: 'Stash a link', presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.7, 1] }}
      />
    </Stack>
  );
}
