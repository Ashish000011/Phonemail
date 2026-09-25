import {
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

export interface Recipient {
  /** What is sent: an email address or a phone number. */
  value: string;
  /** What is shown on the chip: a name when we know one. */
  label: string;
}

export interface Suggestion {
  name: string;
  value: string;
  detail: string;
}

/** A phone number (10–15 digits, spaces and dashes allowed) or an email address. */
export function isValidRecipient(value: string): boolean {
  const text = value.trim();
  if (text.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text);
  return /^\+?\d{10,15}$/.test(text.replace(/[\s()-]/g, ''));
}

const SEPARATORS = /[,;\n]+/;

/**
 * To / Cc / Bcc as chips (docs/spec/07-mobile-ui.md, "Traditional composer").
 * Type a number or an address and press Enter or a comma; suggestions come
 * from your contacts and chats. Invalid chips turn red. A combobox, so it
 * works with the keyboard and screen readers.
 */
export function RecipientField({
  label,
  values,
  onChange,
  suggestions,
  autoFocus = false,
  trailing,
}: {
  label: string;
  values: Recipient[];
  onChange: (values: Recipient[]) => void;
  suggestions: Suggestion[];
  autoFocus?: boolean;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return [];
    const digits = query.replace(/\D/g, '');
    const taken = new Set(values.map((v) => v.value.toLowerCase()));
    return suggestions
      .filter((s) => !taken.has(s.value.toLowerCase()))
      .filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.value.toLowerCase().includes(query) ||
          (digits.length >= 3 && s.detail.replace(/\D/g, '').includes(digits)),
      )
      .slice(0, 6);
  }, [text, suggestions, values]);
  const open = focused && matches.length > 0;

  function add(items: Recipient[]) {
    const known = new Set(values.map((v) => v.value.toLowerCase()));
    const fresh = items.filter((item) => item.value && !known.has(item.value.toLowerCase()));
    if (fresh.length) onChange([...values, ...fresh]);
    setText('');
    setActive(0);
  }

  function commitText() {
    const parts = text
      .split(SEPARATORS)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) add(parts.map((value) => ({ value, label: value })));
  }

  function pick(suggestion: Suggestion) {
    add([{ value: suggestion.value, label: suggestion.name }]);
    input.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (open && event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (open && event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      if (!text.trim()) return;
      event.preventDefault();
      if (open && event.key === 'Enter') pick(matches[Math.min(active, matches.length - 1)]);
      else commitText();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setFocused(false);
    } else if (event.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1));
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text');
    if (!SEPARATORS.test(pasted)) return;
    event.preventDefault();
    const parts = pasted
      .split(SEPARATORS)
      .map((p) => p.trim())
      .filter(Boolean);
    add(parts.map((value) => ({ value, label: value })));
  }

  return (
    <div className="relative border-b border-black/10">
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 px-4 py-1.5">
        <label htmlFor={`${id}-input`} className="w-12 shrink-0 text-[0.9375rem] text-text-muted">
          {label}
        </label>
        {values.map((recipient) => {
          const valid = isValidRecipient(recipient.value);
          return (
            <span
              key={recipient.value}
              title={recipient.value}
              className={`flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-2.5 text-[0.875rem] ${
                valid ? 'border-black/15 bg-[#f0f2f5]' : 'border-danger bg-[#fde8e8] text-[#b3261e]'
              }`}
            >
              <span className="truncate">{recipient.label}</span>
              {!valid && <span className="sr-only">{t('compose.invalidChip')}</span>}
              <button
                type="button"
                aria-label={t('compose.removeRecipient', { name: recipient.label })}
                onClick={() => onChange(values.filter((v) => v.value !== recipient.value))}
                className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          );
        })}
        <input
          id={`${id}-input`}
          ref={input}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          autoFocus={autoFocus}
          autoComplete="off"
          inputMode="email"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commitText();
          }}
          className="min-w-[8rem] flex-1 bg-transparent py-1.5 text-[1rem] outline-none"
        />
        {trailing}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('compose.suggestions')}
          className="absolute inset-x-0 top-full z-30 max-h-72 overflow-y-auto bg-surface py-1 shadow-lg"
        >
          {matches.map((s, index) => (
            <li
              key={s.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown, not click: picking must happen before the input's blur.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className={`flex cursor-pointer flex-col px-4 py-2 ${index === active ? 'bg-black/[0.06]' : ''}`}
            >
              <span className="truncate text-[0.9375rem]">{s.name}</span>
              <span className="truncate text-[0.8125rem] text-text-muted">{s.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
