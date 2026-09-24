import { describe, expect, it } from 'vitest';
import {
  countLinks,
  htmlToPlainText,
  makeSnippet,
  replySubject,
} from '../src/modules/mail/content.js';
import { sanitizeEmailHtml } from '../src/modules/mail/sanitize.js';
import { isSpam, spamScore, type SpamSignals } from '../src/modules/mailbox/spam.js';
import { createSmtpToken, verifySmtpToken } from '../src/modules/smtp/internal-token.js';
import { parseRecipient } from '../src/modules/mail/recipients.js';
import { sanitizeFilename, sniffContentType } from '../src/lib/files.js';

describe('reply subjects', () => {
  it.each([
    ['hi', 'Re: hi'],
    ['Re: hi', 'Re: hi'],
    ['Re: Re: hi', 'Re: hi'],
    ['RE: re:  Lunch?', 'Re: Lunch?'],
    ['Re[2]: status', 'Re: status'],
    ['', 'Re:'],
  ])('"%s" → "%s"', (parent, expected) => {
    expect(replySubject(parent)).toBe(expected);
  });
});

describe('snippets and text', () => {
  it('collapses whitespace and cuts at 140 characters', () => {
    const snippet = makeSnippet(`Hello\n\n${'word '.repeat(60)}`);
    expect(snippet.length).toBeLessThanOrEqual(140);
    expect(snippet.startsWith('Hello word')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('leaves out quoted text in replies', () => {
    const text = 'Sounds good!\n\nOn Mon, 1 Sep 2026 at 10:00, Arjun wrote:\n> Lunch at 1?';
    expect(makeSnippet(text)).toBe('Sounds good!');
  });

  it('derives text from HTML-only emails', () => {
    expect(htmlToPlainText('<p>Hello <b>there</b></p><img src="x.png">')).toBe('Hello there');
  });

  it('counts links', () => {
    expect(countLinks('see https://a.com and http://b.com')).toBe(2);
  });
});

describe('HTML sanitizer (the "malicious HTML" demo)', () => {
  const malicious = `
    <p onclick="steal()">Hi <b>there</b></p>
    <script>alert('xss')</script>
    <img src="x" onerror="alert(1)">
    <a href="javascript:alert(2)">click</a>
    <a href="https://example.com">safe link</a>
    <iframe src="https://evil.example"></iframe>
    <form action="https://evil.example"><input name="password"></form>
    <meta http-equiv="refresh" content="0;url=https://evil.example">
    <div style="background:url(https://track.example/p.gif);color:red">styled</div>
    <img src="https://track.example/pixel.gif" width="1" height="1">
    <a href="data:text/html;base64,PHNjcmlwdD4=">data link</a>
  `;
  const { html, hasRemoteImages } = sanitizeEmailHtml(malicious);

  it('removes scripts, event handlers and javascript: links', () => {
    expect(html).not.toMatch(/<script|alert\('xss'\)|onerror|onclick|javascript:/i);
  });

  it('removes iframes, forms and meta refresh', () => {
    expect(html).not.toMatch(/<iframe|<form|<input|<meta/i);
  });

  it('removes CSS url() but keeps harmless styles', () => {
    expect(html).not.toMatch(/url\(/i);
    expect(html).toContain('styled');
  });

  it('parks remote images (tracking pixels) until the user allows them', () => {
    expect(hasRemoteImages).toBe(true);
    expect(html).toContain('data-remote-src="https://track.example/pixel.gif"');
    expect(html).not.toMatch(/<img[^>]* src="https:/i);
  });

  it('keeps safe formatting and opens links safely', () => {
    expect(html).toContain('<b>there</b>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('data:text/html');
  });

  it('maps inline cid: images to attachment URLs', () => {
    const result = sanitizeEmailHtml('<img src="cid:logo@x">', {
      'logo@x': '/api/attachments/abc',
    });
    expect(result.html).toBe('<img src="/api/attachments/abc" />');
    expect(result.hasRemoteImages).toBe(false);
  });
});

describe('spam score', () => {
  const base: SpamSignals = {
    blocked: false,
    external: false,
    knownSender: false,
    linkCount: 0,
    subject: 'Lunch?',
    text: 'See you at 1',
  };

  it('ordinary mail from a PhoneMail user is not spam', () => {
    expect(isSpam(base)).toBe(false);
  });

  it('an unknown outside sender alone is not spam (3 points)', () => {
    expect(spamScore({ ...base, external: true })).toBe(3);
    expect(isSpam({ ...base, external: true })).toBe(false);
  });

  it('unknown outside sender + spam phrase is spam', () => {
    expect(isSpam({ ...base, external: true, text: 'You have WON the lottery' })).toBe(true);
  });

  it('shouting subject + many links + unknown sender is spam', () => {
    expect(spamScore({ ...base, external: true, subject: 'FREE STUFF NOW', linkCount: 8 })).toBe(7);
  });

  it('known senders get the benefit of the doubt', () => {
    expect(isSpam({ ...base, external: true, knownSender: true, text: 'act now' })).toBe(false);
  });

  it('a blocked sender is always spam', () => {
    expect(isSpam({ ...base, blocked: true })).toBe(true);
  });
});

describe('internal SMTP tokens', () => {
  const secret = 'test-secret-test-secret';

  it('accepts a fresh token for the same user', () => {
    const token = createSmtpToken('user-1', secret);
    expect(verifySmtpToken('user-1', token, secret)).toBe(true);
  });

  it('rejects another user, another secret, garbage and expired tokens', () => {
    const now = Date.now();
    const token = createSmtpToken('user-1', secret, now);
    expect(verifySmtpToken('user-2', token, secret, now)).toBe(false);
    expect(verifySmtpToken('user-1', token, 'other-secret-other', now)).toBe(false);
    expect(verifySmtpToken('user-1', 'nonsense', secret, now)).toBe(false);
    expect(verifySmtpToken('user-1', token, secret, now + 6 * 60 * 1000)).toBe(false);
  });
});

describe('recipient input', () => {
  const parse = (value: string) => parseRecipient(value, 'phonemail.com', 'IN');

  it.each([
    ['98765 43210', '9876543210@phonemail.com'],
    ['+91 98765-43210', '9876543210@phonemail.com'],
    ['+1 650 253 0000', '0016502530000@phonemail.com'],
    ['arjun', 'arjun@phonemail.com'],
    ['X@Gmail.com', 'x@gmail.com'],
    ['9876543210@phonemail.com', '9876543210@phonemail.com'],
  ])('"%s" → %s', (input, expected) => {
    expect(parse(input)).toBe(expected);
  });

  it.each(['12345', 'not an address', 'a@b', '', 'admin'])('rejects "%s"', (input) => {
    expect(parse(input)).toBeNull();
  });
});

describe('files', () => {
  it('sniffs types from content, not names', () => {
    expect(sniffContentType(new TextEncoder().encode('%PDF-1.7 ...'), 'a.jpg')).toBe(
      'application/pdf',
    );
    expect(
      sniffContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), 'a.pdf'),
    ).toBe('image/png');
    expect(sniffContentType(new TextEncoder().encode('hello'), 'x.exe')).toBe('text/plain');
    expect(sniffContentType(new Uint8Array([0x4d, 0x5a, 0, 0]), 'x.txt')).toBe(
      'application/octet-stream',
    );
  });

  it.each([
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\report.pdf', 'report.pdf'],
    ['.htaccess', 'htaccess'],
    ['a\u0000b<c>.txt', 'abc.txt'],
    ['', 'attachment'],
    [undefined, 'attachment'],
  ])('sanitizes %s', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it('keeps the extension when shortening', () => {
    const name = sanitizeFilename(`${'a'.repeat(300)}.pdf`);
    expect(name.length).toBe(150);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});
