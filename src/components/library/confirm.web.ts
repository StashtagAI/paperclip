/** React Native Web's Alert is a no-op, so the browser's own dialog asks instead. */
export function confirmDestructive(title: string, message: string, _action: string): Promise<boolean> {
  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}
