import { SMTPServer, type SMTPServerSession } from 'smtp-server';
import { env } from '../../config/env.js';
import type { Logger } from '../../lib/logger.js';
import { parseAddress } from '../addressing/index.js';
import { ownedLocalParts, resolveLocalAddress, SYSTEM_LOCAL_PARTS } from '../mail/directory.js';
import { ingestMessage } from '../mail/ingest.js';
import { verifySmtpToken } from './internal-token.js';

/**
 * PhoneMail's own mail server for @MAIL_DOMAIN (docs/spec/04-mail-engine.md).
 *
 * - Anyone may deliver mail *to* PhoneMail users (that's what makes it email).
 * - Only our api, logged in as a user with a short-lived token, may send *out*
 *   to other domains, and only from that user's own addresses.
 * - Everyone else trying to send elsewhere gets "550 Relaying denied": this
 *   is what "not an open relay" means.
 */
const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
const MAX_RECIPIENTS = 50;
const MAX_CONNECTIONS_PER_IP = 10;
const MAX_MESSAGES_PER_IP_PER_MINUTE = 60;

function smtpError(responseCode: number, message: string): Error {
  return Object.assign(new Error(message), { responseCode });
}

/** The signed-in user of an SMTP session (set by onAuth), if any. */
function sessionUser(session: SMTPServerSession): string | undefined {
  return typeof session.user === 'string' ? session.user : undefined;
}

export function createSmtpServer(logger: Logger): SMTPServer {
  const openConnections = new Map<string, number>();
  const messageWindows = new Map<string, { start: number; count: number }>();

  function withinMessageRate(ip: string): boolean {
    const now = Date.now();
    const window = messageWindows.get(ip);
    if (!window || now - window.start > 60_000) {
      messageWindows.set(ip, { start: now, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= MAX_MESSAGES_PER_IP_PER_MINUTE;
  }

  return new SMTPServer({
    name: env.MAIL_DOMAIN,
    banner: 'PhoneMail',
    size: MAX_MESSAGE_BYTES,
    authMethods: ['PLAIN', 'LOGIN'],
    authOptional: true,
    // Traffic from the api stays inside the Docker network; there is no TLS on port 2525.
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    logger: false,

    onConnect(session, callback) {
      const ip = session.remoteAddress;
      const count = (openConnections.get(ip) ?? 0) + 1;
      if (count > MAX_CONNECTIONS_PER_IP) {
        return callback(smtpError(421, '4.7.0 Too many connections from your address'));
      }
      openConnections.set(ip, count);
      callback();
    },

    onClose(session) {
      const ip = session.remoteAddress;
      const count = (openConnections.get(ip) ?? 1) - 1;
      if (count <= 0) openConnections.delete(ip);
      else openConnections.set(ip, count);
    },

    onAuth(auth, _session, callback) {
      const userId = auth.username ?? '';
      if (verifySmtpToken(userId, auth.password ?? '', env.INTERNAL_SMTP_SECRET)) {
        return callback(null, { user: userId });
      }
      callback(smtpError(535, '5.7.8 Authentication failed'));
    },

    onMailFrom(address, session, callback) {
      void (async () => {
        if (!withinMessageRate(session.remoteAddress)) {
          return callback(smtpError(421, '4.7.0 Too many messages, slow down'));
        }
        const parsed = parseAddress(address.address, env.MAIL_DOMAIN);
        const userId = sessionUser(session);
        if (userId) {
          const owned = await ownedLocalParts(userId);
          if (!parsed?.isLocal || !owned.has(parsed.localPart)) {
            return callback(smtpError(553, '5.7.1 You can only send from your own addresses'));
          }
        } else if (parsed?.isLocal) {
          // Nobody outside may pretend to be a PhoneMail user.
          return callback(
            smtpError(530, '5.7.0 Authentication required to send as a PhoneMail address'),
          );
        }
        callback();
      })().catch((err) => {
        logger.error({ err }, 'MAIL FROM check failed');
        callback(smtpError(451, '4.3.0 Temporary error, try again'));
      });
    },

    onRcptTo(address, session, callback) {
      void (async () => {
        if (session.envelope.rcptTo.length >= MAX_RECIPIENTS) {
          return callback(smtpError(452, '4.5.3 Too many recipients'));
        }
        const parsed = parseAddress(address.address, env.MAIL_DOMAIN);
        if (!parsed) return callback(smtpError(553, '5.1.3 Bad recipient address'));
        if (!parsed.isLocal) {
          return sessionUser(session)
            ? callback()
            : callback(smtpError(550, '5.7.1 Relaying denied'));
        }
        if (SYSTEM_LOCAL_PARTS.has(parsed.localPart)) {
          return callback(smtpError(550, '5.1.1 This address does not accept mail'));
        }
        const local = await resolveLocalAddress(address.address);
        callback(local ? undefined : smtpError(550, '5.1.1 No such user'));
      })().catch((err) => {
        logger.error({ err }, 'RCPT TO check failed');
        callback(smtpError(451, '4.3.0 Temporary error, try again'));
      });
    },

    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', (err) => {
        logger.error({ err }, 'smtp data stream error');
        callback(smtpError(451, '4.3.0 Could not read the message'));
      });
      stream.on('end', () => {
        if ((stream as unknown as { sizeExceeded?: boolean }).sizeExceeded) {
          return callback(smtpError(552, '5.3.4 Message too big (25 MB max)'));
        }
        const mailFrom = session.envelope.mailFrom;
        // We answer 250 only after the message is safely stored.
        ingestMessage({
          raw: Buffer.concat(chunks),
          envelope: {
            mailFrom: mailFrom ? mailFrom.address : null,
            rcptTo: session.envelope.rcptTo.map((r) => r.address),
          },
          senderUserId: sessionUser(session),
        })
          .then((result) => {
            logger.info(
              {
                messageId: result.messageId,
                local: result.deliveredUserIds.length,
                external: result.externalRecipients.length,
              },
              'message stored',
            );
            callback(null, `2.0.0 Ok: stored as ${result.messageId}`);
          })
          .catch((err) => {
            logger.error({ err }, 'ingest failed');
            callback(smtpError(451, '4.3.0 Could not store the message, try again later'));
          });
      });
    },
  });
}
