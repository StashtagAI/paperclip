import { useRef, useState, type DragEvent, type ReactNode } from 'react';

/** Item ids travel in the browser's drag data under our own type, so stray drags (files, text) are ignored. */
const ITEM_IDS_TYPE = 'application/x-stashtag-items';

// Lays out like a React Native Web View, so wrapping a row doesn't change it. (display: contents would be invisible to
// layout, but then the browser has no box to start a drag from.)
const wrapper = { display: 'flex', flexDirection: 'column' } as const;

/** Native HTML5 drag and drop: no extra dependency, and the desktop browsers the web app targets all support it. */
export function Draggable({
  getItemIds,
  label,
  children,
}: {
  /** Read at drag start, so dragging a selected row carries the whole selection. */
  getItemIds: () => string[];
  /** Text on the drag preview, e.g. "3 saves". */
  label: (count: number) => string;
  children: ReactNode;
}) {
  function onDragStart(event: DragEvent<HTMLDivElement>) {
    const ids = getItemIds();
    event.dataTransfer.setData(ITEM_IDS_TYPE, JSON.stringify(ids));
    event.dataTransfer.effectAllowed = 'move';
    // A small pill instead of a ghost of the whole table row.
    const preview = document.createElement('div');
    preview.textContent = label(ids.length);
    Object.assign(preview.style, {
      position: 'fixed',
      top: '-1000px',
      padding: '6px 12px',
      borderRadius: '999px',
      background: '#1F6FEB',
      color: '#fff',
      font: '600 14px var(--font-display)',
    });
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 12, 12);
    setTimeout(() => preview.remove(), 0);
  }
  return (
    <div draggable onDragStart={onDragStart} style={wrapper}>
      {children}
    </div>
  );
}

export function DropTarget({
  onDropItems,
  children,
}: {
  onDropItems: (itemIds: string[]) => void;
  /** `over` is true while a save is dragged over the target. */
  children: (over: boolean) => ReactNode;
}) {
  const [over, setOver] = useState(false);
  // dragenter/dragleave also fire when moving between child elements; count them so the highlight doesn't flicker.
  const depth = useRef(0);
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(ITEM_IDS_TYPE);

  return (
    <div
      style={wrapper}
      onDragEnter={(event) => {
        if (!accepts(event)) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!accepts(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        depth.current = 0;
        setOver(false);
        if (!accepts(event)) return;
        event.preventDefault();
        try {
          const ids: unknown = JSON.parse(event.dataTransfer.getData(ITEM_IDS_TYPE));
          if (Array.isArray(ids) && ids.every((id) => typeof id === 'string') && ids.length) onDropItems(ids);
        } catch {
          // Not our payload.
        }
      }}>
      {children(over)}
    </div>
  );
}
