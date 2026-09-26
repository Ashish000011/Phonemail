import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { requestMeta } from '../../lib/request-meta.js';
import { handleInboundSms, ivrMenu, ivrWelcome } from './service.js';
import { twilioGet } from '../../providers/twilio-client.js';
import {
  response,
  twilioRecordMatches,
  twilioRecordToConfirm,
  validTwilioSignature,
} from './twiml.js';

type Form = Record<string, string>;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Only Twilio may call these: it signs each request with our auth token and
 * the public URL it called. No token configured = the webhooks are closed.
 */
async function verifyTwilio(request: FastifyRequest): Promise<void> {
  if (!env.TWILIO_AUTH_TOKEN) {
    throw new AppError(403, 'FORBIDDEN', 'Twilio is not configured.');
  }
  const signature = request.headers['x-twilio-signature'];
  const params = (request.body ?? {}) as Form;
  if (typeof signature === 'string') {
    const url = env.PUBLIC_BASE_URL.replace(/\/$/, '') + request.url;
    if (validTwilioSignature(env.TWILIO_AUTH_TOKEN, url, params, signature)) return;
    request.log.warn({ url }, 'bad Twilio signature');
    throw new AppError(403, 'FORBIDDEN', 'Bad signature.');
  }
  // Trial accounts get call webhooks through a Twilio proxy that drops the
  // signature. Then we ask Twilio itself whether this call is real, ours and live.
  if (env.TWILIO_TRIAL && (await confirmedByTwilio(params))) return;
  request.log.warn('unsigned Twilio request');
  throw new AppError(403, 'FORBIDDEN', 'Bad signature.');
}

/** Looks the call (or message) up at Twilio with our credentials and compares it. */
async function confirmedByTwilio(params: Form): Promise<boolean> {
  const accountSid = env.TWILIO_ACCOUNT_SID ?? '';
  const target = twilioRecordToConfirm(params, accountSid);
  if (!target) return false;
  const record = await twilioGet(
    env,
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${target.kind}/${target.sid}.json`,
  ).catch(() => null);
  return record !== null && twilioRecordMatches(params, record, accountSid);
}

const sendTwiml = (reply: FastifyReply, twiml: string) =>
  reply.header('Content-Type', 'text/xml; charset=utf-8').send(twiml);

/**
 * Webhooks for the phone world (docs/spec/06): Twilio calls and texts, and
 * texts forwarded by the SMSGate phone. They live under /webhooks, outside
 * /api, because they're called by those services, not by our apps.
 */
export async function telephonyRoutes(fastify: FastifyInstance) {
  // Twilio posts classic HTML-form bodies.
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );
  // SMSGate signs the raw JSON, so keep the exact text as well as the parsed object.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      try {
        done(null, { raw: body as string, json: JSON.parse(body as string) });
      } catch (err) {
        done(err as Error);
      }
    },
  );

  const hidden = { schema: { hide: true } };

  fastify.post<{ Querystring: { retry?: string } }>(
    '/webhooks/twilio/voice',
    { ...hidden, preHandler: verifyTwilio },
    async (request, reply) => sendTwiml(reply, ivrWelcome(request.query.retry === '1').twiml),
  );

  fastify.post<{ Querystring: { retry?: string }; Body: Form }>(
    '/webhooks/twilio/voice/menu',
    { ...hidden, preHandler: verifyTwilio },
    async (request, reply) => {
      const body = request.body;
      // For "Call me" (Twilio calls the user), the person is the one being called.
      const callerPhone = body.Direction === 'outbound-api' ? body.To : body.From;
      const step = await ivrMenu({
        callerPhone: callerPhone ?? '',
        digits: body.Digits ?? '',
        retry: request.query.retry === '1',
        meta: requestMeta(request),
      });
      return sendTwiml(reply, step.twiml);
    },
  );

  fastify.post<{ Body: Form }>(
    '/webhooks/twilio/sms',
    { ...hidden, preHandler: verifyTwilio },
    async (request, reply) => {
      await handleInboundSms(
        'twilio',
        request.body.From ?? '',
        request.body.Body ?? '',
        requestMeta(request),
      );
      // Replies can't be TwiML on a trial account; the worker sends them by the REST API.
      return sendTwiml(reply, response());
    },
  );

  fastify.post<{
    Params: { secret: string };
    Body: { raw: string; json: { event?: string; payload?: Record<string, unknown> } };
  }>('/webhooks/smsgate/:secret', hidden, async (request, reply) => {
    // The secret path segment is the password; a wrong one looks like any unknown page.
    if (!safeEqual(request.params.secret, env.SMSGATE_WEBHOOK_SECRET)) {
      throw new AppError(404, 'NOT_FOUND', 'Not found.');
    }
    // Optional second check: SMSGate's HMAC signature over body + timestamp.
    if (env.SMSGATE_SIGNING_KEY) {
      const timestamp = String(request.headers['x-timestamp'] ?? '');
      const signature = String(request.headers['x-signature'] ?? '');
      const expected = createHmac('sha256', env.SMSGATE_SIGNING_KEY)
        .update(request.body.raw + timestamp)
        .digest('hex');
      const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
      if (!fresh || !safeEqual(signature, expected)) {
        throw new AppError(403, 'FORBIDDEN', 'Bad signature.');
      }
    }
    const { event, payload } = request.body.json;
    if (event === 'sms:received' && payload) {
      const sender = String(payload.sender ?? payload.phoneNumber ?? '');
      const message = String(payload.message ?? '');
      const result = await handleInboundSms('smsgate', sender, message, requestMeta(request));
      // Log the outcome and why a text was ignored, never the text of a personal message.
      const reason = result.outcome === 'ignored' ? result.reason : undefined;
      request.log.info({ outcome: result.outcome, reason }, 'smsgate inbound');
    }
    return reply.send({ ok: true });
  });
}
