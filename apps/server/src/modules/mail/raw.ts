import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer/index.js';

/**
 * Builds a complete email (MIME) as bytes without sending it, using
 * nodemailer's buffer mode. Used for system mail and seed data, which go
 * straight into the ingest pipeline.
 */
const composer = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: 'unix',
});

export async function buildRawEmail(options: Mail.Options): Promise<Buffer> {
  const info = await composer.sendMail(options);
  return info.message as Buffer;
}
