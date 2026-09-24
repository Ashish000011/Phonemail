import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: what the button does, for screen readers ("Search", "Back"). */
  label: string;
  icon: LucideIcon;
  /** White icon, for use on dark or brand-colored backgrounds. */
  light?: boolean;
  size?: number;
}

/** A round, 44 px touch target with an icon and a required accessible name. */
export function IconButton({
  label,
  icon: Icon,
  light,
  size = 24,
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
        light
          ? 'text-white hover:bg-white/10 active:bg-white/20'
          : 'text-text-muted hover:bg-black/5 active:bg-black/10'
      } disabled:opacity-40 ${className}`}
      {...rest}
    >
      <Icon size={size} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}
