/** A key press as the desktop layout sees it. */
export type ShortcutKey = { key: string; mod: boolean; shift: boolean; inTextField: boolean };

/**
 * Keyboard shortcuts for the desktop layout. Web only (use-shortcuts.web.ts); a no-op on native.
 * `onKey` returns true when it handled the key, which stops the browser's default action.
 */
export function useShortcuts(_onKey: (key: ShortcutKey) => boolean) {}
