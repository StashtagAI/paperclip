import type { ReactNode } from 'react';

/**
 * Drag a save onto a list. Only the web build supports it (drag.web.tsx); the desktop layout that uses these is
 * web-only, so on native they just render their children.
 */
export function Draggable({ children }: { getItemIds: () => string[]; label: (count: number) => string; children: ReactNode }) {
  return children;
}

export function DropTarget({
  children,
}: {
  onDropItems: (itemIds: string[]) => void;
  children: (over: boolean) => ReactNode;
}) {
  return children(false);
}
