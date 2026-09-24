import { useRef, type PointerEvent, type MouseEvent } from 'react';

/**
 * Long-press (hold ~0.45 s) for touch and mouse. The context-menu event also
 * counts, so right-click, and the keyboard's Menu key or Shift+F10 on a focused
 * row, do the same thing: the accessible route to selection mode.
 */
export function useLongPress(onLongPress: () => void, delay = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return {
    onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
        onLongPress();
      }, delay);
    },
    onPointerMove(event: PointerEvent) {
      // Scrolling isn't a long-press.
      if (!start.current) return;
      const moved = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
      if (moved > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu(event: MouseEvent) {
      event.preventDefault();
      if (!fired.current) onLongPress();
      fired.current = false;
    },
    /** Call from onClick: true if this click ended a long-press (so it shouldn't open anything). */
    consumeClick(): boolean {
      const wasLongPress = fired.current;
      fired.current = false;
      return wasLongPress;
    },
  };
}
