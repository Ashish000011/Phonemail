import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { IconButton } from './IconButton';

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/**
 * The ⋮ menu in a top bar. Arrow keys move between items, Escape closes and
 * returns focus to the button, a tap outside closes it.
 */
export function OverflowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        buttons[(index + 1) % buttons.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <IconButton
        ref={button}
        label={label}
        icon={MoreVertical}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul
            ref={list}
            role="menu"
            aria-label={label}
            className="absolute top-12 right-1 z-50 min-w-[200px] rounded-xl bg-surface py-2 shadow-[0_2px_12px_rgba(0,0,0,0.18)]"
          >
            {items.map((item) => (
              <li key={item.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex min-h-12 w-full items-center px-5 text-left text-[0.9375rem] hover:bg-black/5 focus:bg-black/5 focus:outline-none ${
                    item.danger ? 'text-danger' : ''
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
