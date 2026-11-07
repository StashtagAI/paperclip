import { Stack } from 'expo-router';

export default function ListsLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitle: true, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Lists' }} />
      <Stack.Screen name="[categoryId]" options={{ title: '' }} />
      <Stack.Screen name="list/[listId]" options={{ title: '', headerLargeTitle: false }} />
    </Stack>
  );
}
