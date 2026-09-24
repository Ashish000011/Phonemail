import type { ReactNode } from 'react';

/**
 * The bar at the top of every mobile screen: optional left action, title
 * (with an optional second line), and actions on the right.
 */
export function TopBar({
  title,
  subtitle,
  left,
  right,
  titleClassName = '',
  onTitleClick,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  titleClassName?: string;
  onTitleClick?: () => void;
  className?: string;
}) {
  const heading = (
    <span className="flex min-w-0 flex-col items-start text-left">
      <span
        className={`w-full truncate text-[1.25rem] leading-tight font-medium ${titleClassName}`}
      >
        {title}
      </span>
      {subtitle && (
        <span className="w-full truncate text-[0.8125rem] text-text-muted">{subtitle}</span>
      )}
    </span>
  );

  return (
    <header
      className={`sticky top-0 z-20 flex h-16 shrink-0 items-center gap-1 bg-surface px-1 pt-[env(safe-area-inset-top)] ${className}`}
    >
      {left}
      <h1 className={`min-w-0 flex-1 ${left ? '' : 'pl-3'}`}>
        {onTitleClick ? (
          <button
            type="button"
            onClick={onTitleClick}
            className="flex w-full min-w-0 items-center rounded-lg py-1 text-left"
          >
            {heading}
          </button>
        ) : (
          heading
        )}
      </h1>
      {right && <div className="flex shrink-0 items-center">{right}</div>}
    </header>
  );
}
