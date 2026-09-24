import type { ReactNode } from 'react';

/** A filter chip (All, Unread, …). The selected one is tinted like WhatsApp's. */
export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`min-h-9 shrink-0 rounded-full px-4 text-[0.875rem] font-medium transition-colors ${
        selected ? 'bg-[#d9fdd3] text-[#0a5c47]' : 'bg-app-bg text-text-muted hover:bg-black/5'
      }`}
    >
      {children}
    </button>
  );
}

/** Grey placeholder rows while the chat list loads. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-[72px] items-center gap-3 px-4">
          <div className="h-12 w-12 animate-pulse rounded-full bg-app-bg" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3.5 w-2/5 animate-pulse rounded bg-app-bg" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-app-bg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A friendly empty screen that says what to do next. */
export function EmptyState({
  title,
  body,
  illustration,
  action,
}: {
  title: string;
  body?: string;
  illustration?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-10 py-14 text-center">
      {illustration}
      <h2 className="mt-5 text-[1.0625rem] font-medium">{title}</h2>
      {body && <p className="mt-2 text-[0.875rem] text-text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A little drawing for empty states: an envelope turning into a chat bubble. */
export function EnvelopeIllustration() {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" aria-hidden="true">
      <rect x="10" y="18" width="72" height="50" rx="8" fill="#d9fdd3" />
      <path
        d="M14 24l32 24 32-24"
        fill="none"
        stroke="#008069"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M70 40h34a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H86l-10 8v-8h-6a8 8 0 0 1-8-8V48a8 8 0 0 1 8-8z"
        fill="#008069"
      />
      <circle cx="80" cy="58" r="3" fill="#fff" />
      <circle cx="90" cy="58" r="3" fill="#fff" />
      <circle cx="100" cy="58" r="3" fill="#fff" />
    </svg>
  );
}

/** Full-width filled button for onboarding screens ("Next", "Agree and continue"). */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="min-h-12 w-full rounded-full bg-brand px-6 text-[1rem] font-medium text-white transition-opacity hover:bg-[#006e5a] disabled:opacity-50"
    >
      {children}
    </button>
  );
}
