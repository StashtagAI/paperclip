/** Multi-select helpers for the desktop table: plain click, Cmd/Ctrl-click to toggle, Shift-click for a range. */

export type ClickModifiers = { toggle: boolean; range: boolean };

/**
 * The selection after clicking `id` in `order` (the visible rows, top to bottom).
 * `anchor` is the last row clicked without Shift; a range runs from it to `id` and is added to the selection.
 */
export function clickSelect(
  selected: ReadonlySet<string>,
  order: readonly string[],
  anchor: string | null,
  id: string,
  { toggle, range }: ClickModifiers,
): Set<string> {
  if (range && anchor !== null) {
    const from = order.indexOf(anchor);
    const to = order.indexOf(id);
    if (from !== -1 && to !== -1) {
      const [start, end] = from < to ? [from, to] : [to, from];
      return new Set([...selected, ...order.slice(start, end + 1)]);
    }
  }
  if (toggle) return toggleOne(selected, id);
  return new Set([id]);
}

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** What a drag or bulk action applies to: the whole selection if `id` is in it, otherwise just `id`. */
export function actionTargets(selected: ReadonlySet<string>, id: string | null): string[] {
  if (id !== null && !selected.has(id)) return [id];
  return [...selected];
}
