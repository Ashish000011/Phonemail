/**
 * The PhoneMail logo: a chat bubble whose top folds like an envelope flap.
 * Decorative by default; pass a label when it stands alone.
 * tone="light" is for brand-colored bars (white bubble, green flap).
 */
export function Logo({
  size = 32,
  label,
  tone = 'brand',
}: {
  size?: number;
  label?: string;
  tone?: 'brand' | 'light';
}) {
  const bubble = tone === 'brand' ? 'var(--color-brand)' : '#fff';
  const flap = tone === 'brand' ? '#fff' : 'var(--color-brand)';
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
        fill={bubble}
      />
      <path
        d="M10.5 14.5 24 24.5l13.5-10"
        fill="none"
        stroke={flap}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
