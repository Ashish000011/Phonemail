/**
 * PhoneMail's chat wallpaper: WhatsApp's doodle idea redrawn with mail
 * motifs (envelopes, stamps, @ signs, paper planes, postmarks), very faint
 * on the warm chat background. One 240 px SVG tile, repeated.
 */
const INK = '#d9d2c7';

const tile = `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <g transform="translate(18 20) rotate(-12)">
    <rect width="40" height="27" rx="4"/><path d="M2 3l18 13 18-13"/>
  </g>
  <g transform="translate(150 16) rotate(8)">
    <rect width="30" height="36" rx="2" stroke-dasharray="3 3"/><rect x="6" y="6" width="18" height="18" rx="2"/><path d="M10 30h10"/>
  </g>
  <g transform="translate(92 60)">
    <circle cx="14" cy="14" r="6"/><path d="M20 14v3a4 4 0 0 0 8 0v-3a14 14 0 1 0-6 11.5"/>
  </g>
  <g transform="translate(22 108) rotate(-18)">
    <path d="M0 16L40 0 26 36 18 22z"/><path d="M18 22L40 0"/>
  </g>
  <g transform="translate(172 92)">
    <circle cx="20" cy="20" r="18"/><circle cx="20" cy="20" r="11"/><path d="M-8 12q7-6 14 0t14 0 14 0 14 0M-8 28q7-6 14 0t14 0 14 0 14 0"/>
  </g>
  <g transform="translate(96 150) rotate(10)">
    <rect width="44" height="30" rx="4"/><path d="M2 3l20 14 20-14"/><path d="M2 28l14-11M42 28L28 17"/>
  </g>
  <g transform="translate(18 184) rotate(6)">
    <rect width="28" height="34" rx="2" stroke-dasharray="3 3"/><path d="M8 12h12M8 18h12M8 24h7"/>
  </g>
  <g transform="translate(176 176) rotate(-8)">
    <path d="M0 14L34 0 22 30 15 19z"/><path d="M15 19L34 0"/><path d="M-10 26q6 4 12 0" stroke-dasharray="2 4"/>
  </g>
  <g transform="translate(206 44)">
    <path d="M0 8h14M7 1v14"/>
  </g>
  <g transform="translate(70 214)">
    <circle cx="6" cy="6" r="3"/>
  </g>
  <g transform="translate(134 118)">
    <path d="M0 5l4 4 8-8"/>
  </g>
</svg>`;

export const WALLPAPER_URL = `url("data:image/svg+xml,${encodeURIComponent(tile.replace(/\s+/g, ' ').trim())}")`;
