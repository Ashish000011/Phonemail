#!/usr/bin/env node
// WCAG 2.2 contrast check for every text/background pair the two clients use
// (docs/spec/09-quality.md, "Accessibility"). Run: node scripts/check-contrast.mjs
// Exits with 1 if a pair is below its minimum, so CI catches a bad colour change.

/** [what, foreground, background, minimum] — 4.5 for text, 3 for large text and icons. */
const PAIRS = [
  // Mobile (WhatsApp look)
  ['body text on white', '#111b21', '#ffffff', 4.5],
  ['body text on app background', '#111b21', '#f0f2f5', 4.5],
  ['body text on outgoing bubble', '#111b21', '#d9fdd3', 4.5],
  ['body text on chat wallpaper', '#111b21', '#efeae2', 4.5],
  ['muted text on white', '#54656f', '#ffffff', 4.5],
  ['muted text on app background', '#54656f', '#f0f2f5', 4.5],
  ['muted text (time) on outgoing bubble', '#54656f', '#d9fdd3', 4.5],
  ['brand text (links, tabs) on white', '#008069', '#ffffff', 4.5],
  ['white on brand buttons', '#ffffff', '#008069', 4.5],
  ['"Read more" link on white bubble', '#026c9c', '#ffffff', 4.5],
  ['"Read more" link on outgoing bubble', '#026c9c', '#d9fdd3', 4.5],
  ['error text on white', '#d93025', '#ffffff', 4.5],
  ['invalid recipient chip', '#b3261e', '#fde8e8', 4.5],
  ['demo banner text', '#111b21', '#fff5c4', 4.5],
  ['blue ticks on outgoing bubble (icon, also spoken)', '#1a8fcc', '#d9fdd3', 3],
  // Web (Gmail look)
  ['body text on web background', '#111b21', '#f6f8fc', 4.5],
  ['muted text on read rows', '#54656f', '#f6f8fc', 4.5],
  ['text on selected rows', '#111b21', '#d2f1e8', 4.5],
  ['muted snippet on selected rows', '#54656f', '#d2f1e8', 4.5],
  ['active folder text', '#00513f', '#d2f1e8', 4.5],
  ['Compose button text', '#00513f', '#c7f0e6', 4.5],
  ['search highlight', '#111b21', '#fde293', 4.5],
  ['compose window title bar', '#111b21', '#f2f6fc', 4.5],
  // White initials on every avatar colour (shared/src/avatar.ts)
  ...[
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
  ].map((color) => [`white initials on ${color}`, '#ffffff', color, 4.5]),
];

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

let failed = 0;
for (const [what, fg, bg, min] of PAIRS) {
  const value = ratio(fg, bg);
  const ok = value >= min;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${value.toFixed(2).padStart(5)}:1 (min ${min}) ${what}`);
}
console.log(failed ? `\n${failed} pair(s) below the minimum.` : '\nAll pairs pass.');
process.exit(failed ? 1 : 0);
