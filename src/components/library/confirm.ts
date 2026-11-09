import { Alert } from 'react-native';

/** Asks before a destructive action. Alert on native; confirm.web.ts uses the browser dialog. */
export function confirmDestructive(title: string, message: string, action: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}
