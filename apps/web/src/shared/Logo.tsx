/**
 * The PhoneMail logo: a chat bubble whose top folds like an envelope flap.
 * Decorative by default; pass a label when it stands alone.
 */
export function Logo({ size = 32, label }: { size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        d="M9 8h30a5 5 0 0 1 5 5v18a5 5 0 0 1-5 5H21l-9 7v-7H9a5 5 0 0 1-5-5V13a5 5 0 0 1 5-5z"
        fill="var(--color-brand)"
      />
      <path
        d="M10.5 14.5 24 24.5l13.5-10"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
