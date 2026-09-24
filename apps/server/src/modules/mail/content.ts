import { convert } from 'html-to-text';

/**
 * Small text helpers for email content: reply subjects, plain text from HTML,
 * and the one-line preview ("snippet") shown in chat and inbox lists.
 */

const RE_PREFIXES = /^(\s*re\s*(\[\d+\])?\s*:\s*)+/i;

/** "hi" → "Re: hi"; "Re: Re: hi" → "Re: hi" (no stacking). */
export function replySubject(parentSubject: string): string {
  return `Re: ${parentSubject.replace(RE_PREFIXES, '').trim()}`.trim();
}

/** For emails that only have HTML (common from newsletters). */
export function htmlToPlainText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
    ],
  }).trim();
}

const SNIPPET_LENGTH = 140;

/**
 * First ~140 characters of what the sender actually wrote: quoted lines
 * ("> …") and the "On … wrote:" line above them are left out.
 */
export function makeSnippet(text: string, length = SNIPPET_LENGTH): string {
  const ownLines = text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('>'))
    .filter((line) => !/^On .{3,200} wrote:$/.test(line.trim()));
  const flat = ownLines.join(' ').replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat;
}

/** Links in the text, for the spam score. */
export function countLinks(text: string, html?: string | null): number {
  const fromText = text.match(/https?:\/\//gi)?.length ?? 0;
  const fromHtml = html?.match(/<a\s[^>]*href=/gi)?.length ?? 0;
  return Math.max(fromText, fromHtml);
}
