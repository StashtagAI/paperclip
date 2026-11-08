import { getShareExtensionKey } from 'expo-share-intent';

/**
 * The iOS share extension opens the app with `stashtag://dataUrl=stashtagShareKey…`. That isn't a route, so send it to
 * /share, which reads the shared link from expo-share-intent. Every other deep link passes through unchanged.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return '/share';
    return path;
  } catch {
    return '/';
  }
}
