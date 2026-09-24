import sanitizeHtml from 'sanitize-html';

/**
 * Makes an email's HTML safe to show (docs/spec/04-mail-engine.md, "HTML
 * safety"). This is layer one; layer two is the sandboxed iframe with a
 * script-blocking CSP in the reader. Both would have to fail for a script to run.
 */

export interface SanitizedHtml {
  html: string;
  /** True when remote images were found; they're blocked until the user taps "Show images". */
  hasRemoteImages: boolean;
}

// No url(), expression() or javascript: inside any allowed CSS value.
const SAFE_CSS_VALUE = [/^(?!.*(url\s*\(|expression\s*\(|javascript:|@import)).*$/i];

const STYLE_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-align',
  'text-decoration',
  'text-transform',
  'line-height',
  'letter-spacing',
  'white-space',
  'vertical-align',
  'direction',
  'display',
  'width',
  'max-width',
  'min-width',
  'height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-width',
  'border-style',
  'border-radius',
  'border-collapse',
];

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

/**
 * @param cidToUrl maps inline-image Content-IDs (cid:logo123) to our attachment URLs
 */
export function sanitizeEmailHtml(
  html: string,
  cidToUrl: Record<string, string> = {},
): SanitizedHtml {
  let hasRemoteImages = false;

  const clean = sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'span',
      'font',
      'center',
      'u',
      's',
      'strike',
      'small',
      'big',
      'hr',
      'h1',
      'h2',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'data-remote-src'],
      font: ['face', 'size', 'color'],
      '*': [
        'style',
        'align',
        'valign',
        'width',
        'height',
        'bgcolor',
        'border',
        'cellpadding',
        'cellspacing',
        'colspan',
        'rowspan',
        'dir',
        'lang',
      ],
    },
    allowedStyles: { '*': Object.fromEntries(STYLE_PROPERTIES.map((p) => [p, SAFE_CSS_VALUE])) },
    // Links: web, mail and phone only. No javascript:, no data: pages.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowProtocolRelative: false,
    // <script>, <style>, <iframe>, <form>, <object>, <meta> … are dropped, content and all.
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
      }),
      img: (tagName, attribs) => {
        const { src = '', ...rest } = attribs;
        if (/^https?:/i.test(src)) {
          // Remote images (and tracking pixels) stay parked until the user allows them.
          hasRemoteImages = true;
          return { tagName, attribs: { ...rest, 'data-remote-src': src } };
        }
        if (/^cid:/i.test(src)) {
          const url = cidToUrl[src.slice(4).replace(/^<|>$/g, '')];
          return { tagName, attribs: url ? { ...rest, src: url } : rest };
        }
        if (SAFE_DATA_IMAGE.test(src)) return { tagName, attribs: { ...rest, src } };
        return { tagName, attribs: rest };
      },
    },
    // An image with nothing left to show is dropped entirely.
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && !frame.attribs.src && !frame.attribs['data-remote-src'],
  });

  return { html: clean, hasRemoteImages };
}
