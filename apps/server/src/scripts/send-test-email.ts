import { parseArgs } from 'node:util';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

/**
 * Sends one email into PhoneMail from an outside address, the way Gmail's
 * servers would: plain SMTP to port 2525, no login. Runs inside the stack:
 *
 *   docker compose exec api node dist/scripts/send-test-email.js \
 *     --to 9000000001@phonemail.com --subject "Hello" --text "Hi there"
 */
const { values } = parseArgs({
  options: {
    to: { type: 'string' },
    from: { type: 'string', default: 'newsletter@example.com' },
    subject: { type: 'string', default: 'Hello from outside PhoneMail' },
    text: { type: 'string', default: 'This email came in over SMTP from another domain.' },
    html: { type: 'string' },
    host: { type: 'string', default: env.SMTP_SUBMIT_HOST },
    port: { type: 'string', default: String(env.SMTP_PORT) },
  },
});

if (!values.to) {
  console.error('Usage: send-test-email --to <address> [--from] [--subject] [--text] [--html]');
  process.exit(2);
}

const transport = nodemailer.createTransport({
  host: values.host,
  port: Number(values.port),
  secure: false,
  ignoreTLS: true,
});

try {
  const info = await transport.sendMail({
    from: values.from,
    to: values.to,
    subject: values.subject,
    text: values.text,
    html: values.html,
  });
  console.log(`Sent ${info.messageId}: ${info.response}`);
} catch (err) {
  console.error(`Refused: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  transport.close();
}
