/**
 * How people are drawn when they have no photo (docs/spec/05-conversations.md,
 * "Titles and avatars"). Shared so the server and the apps agree.
 */

/** Dark enough that white initials pass 4.5:1 contrast on every one. */
export const AVATAR_COLORS = [
  '#0f766e',
  '#1d4ed8',
  '#7c3aed',
  '#be185d',
  '#b45309',
  '#15803d',
  '#0369a1',
  '#9333ea',
  '#c2410c',
  '#4d7c0f',
  '#a21caf',
  '#0e7490',
];

/** The same person always gets the same color, on every device. */
export function colorFor(key: string): string {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** "Arjun Kumar" → "AK", "meera" → "M". Numbers get no initials (the UI shows a person icon). */
export function initialsFor(name: string): string {
  if (!/\p{L}/u.test(name.charAt(0))) return '';
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((w) => [...w][0]?.toUpperCase() ?? '').join('');
}
