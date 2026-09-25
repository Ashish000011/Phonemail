import { useEffect, useRef } from 'react';

/** Typing in a field must never trigger a shortcut. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Gmail-style single-key shortcuts (docs/spec/08-web-ui.md). Each screen
 * registers the keys it understands; they are ignored while typing, with a
 * modifier held, or while a dialog is open. Enter is left alone on buttons
 * and links so they keep working as usual.
 */
export function useHotkeys(handlers: Record<string, (event: KeyboardEvent) => void>) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (isTyping(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const onButton =
        event.target instanceof HTMLElement && event.target.closest('button, a, [role="menuitem"]');
      if (event.key === 'Enter' && onButton) return;
      const handler = latest.current[event.key];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
