import { useEffect, useMemo, useState } from 'react';

/** Readable defaults inside the frame; the email's own inline styles still win. */
const FRAME_CSS = `
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; padding: 4px 16px 24px; font: 16px/1.5 system-ui, 'Noto Sans', sans-serif;
         color: #111b21; overflow-wrap: anywhere; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre { white-space: pre-wrap; }
  a { color: #026c9c; }
  blockquote { margin: 0 0 0 4px; padding-left: 12px; border-left: 3px solid #d1d7db; color: #54656f; }
`;

/** Inline images (cid:) that the sanitizer pointed at our attachment URLs. */
function inlineImageUrls(html: string): string[] {
  return [
    ...new Set([...html.matchAll(/src="(\/api\/attachments\/[0-9a-f-]+)"/g)].map((m) => m[1])),
  ];
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * The srcdoc for the frame. DOMParser builds an inert document (no scripts
 * run, no images load), so we can safely swap image sources before the frame
 * ever sees the HTML.
 */
function buildDocument(html: string, inline: Record<string, string>, showRemote: boolean): string {
  const parsed = new DOMParser().parseFromString(
    `<!doctype html><body>${html}</body>`,
    'text/html',
  );
  for (const img of parsed.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('/api/attachments/')) {
      if (inline[src]) img.setAttribute('src', inline[src]);
      else img.removeAttribute('src');
    }
    const remote = img.getAttribute('data-remote-src');
    if (remote && showRemote) img.setAttribute('src', remote);
  }
  const images = showRemote ? 'data: https:' : 'data:';
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${images}; font-src data:`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>${FRAME_CSS}</style></head><body>${parsed.body.innerHTML}</body></html>`;
}

/**
 * An email's HTML, shown the safe way (docs/spec/04-mail-engine.md, "HTML
 * safety"): the server already sanitized it; here it goes into a sandboxed
 * frame that can't run scripts, can't reach this page, and only loads the
 * images we allow. The frame has no cookies, so inline images are fetched
 * here and handed over as data: URLs. Remote images wait for "Show images".
 */
export function EmailFrame({
  html,
  showRemote,
  title,
  // One screen tall by default: long emails scroll inside, and the page scrolls to reach it.
  heightClass = 'h-[calc(100dvh-8.5rem)] min-h-[320px]',
}: {
  html: string;
  showRemote: boolean;
  title: string;
  heightClass?: string;
}) {
  const [inline, setInline] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const urls = inlineImageUrls(html);
    if (urls.length === 0) return;
    void Promise.all(urls.map(async (url) => [url, await toDataUrl(url)] as const)).then(
      (pairs) => {
        if (cancelled) return;
        setInline(Object.fromEntries(pairs.filter((p): p is [string, string] => p[1] !== null)));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [html]);

  const srcDoc = useMemo(() => buildDocument(html, inline, showRemote), [html, inline, showRemote]);

  return (
    <iframe
      // A fresh frame for each version (inline images arrived, "Show images"), rather
      // than re-navigating the old one: a frame whose first load failed never recovers.
      key={srcDoc}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className={`block w-full border-0 bg-white ${heightClass}`}
    />
  );
}
