import type { RegistrationChannel, User } from '@prisma/client';
import { env } from '../../config/env.js';
import { db, isUniqueViolation } from '../../lib/db.js';
import type { RequestMeta } from '../../lib/request-meta.js';
import { normalizePhone } from '../addressing/index.js';
import { recordAuthEvent } from './auth-events.js';

export interface CreateAccountInput {
  phone: string;
  channel: RegistrationChannel;
  /** Set when the account is created through a UI where terms were accepted. */
  tosVersion?: string;
  passwordHash?: string;
  mustChangePassword?: boolean;
  meta?: Partial<RequestMeta>;
}

type AccountListener = (user: User) => Promise<void>;
const accountCreatedListeners: AccountListener[] = [];

/**
 * Lets other modules react to new accounts without this module knowing about
 * them (the mail engine sends the welcome email from here, Phase 2).
 */
export function onAccountCreated(listener: AccountListener) {
  accountCreatedListeners.push(listener);
}

/**
 * The one way accounts are made, for every channel: IVR, SMS, portal, web and
 * mobile (docs/spec/03-auth-and-accounts.md). An existing account is returned
 * with created = false; each caller decides whether that's an error.
 */
export async function createAccount(
  input: CreateAccountInput,
): Promise<{ user: User; created: boolean }> {
  const phone = normalizePhone(input.phone, env.DEFAULT_COUNTRY);

  const existing = await db.user.findUnique({ where: { phoneE164: phone.e164 } });
  if (existing) return { user: existing, created: false };

  let user: User;
  try {
    user = await db.user.create({
      data: {
        phoneE164: phone.e164,
        localPart: phone.localPart,
        registrationChannel: input.channel,
        tosVersion: input.tosVersion,
        tosAcceptedAt: input.tosVersion ? new Date() : null,
        passwordHash: input.passwordHash,
        mustChangePassword: input.mustChangePassword ?? false,
      },
    });
  } catch (err) {
    // Two sign-ups for the same number at the same moment: the other one won.
    if (isUniqueViolation(err)) {
      const winner = await db.user.findUniqueOrThrow({ where: { phoneE164: phone.e164 } });
      return { user: winner, created: false };
    }
    throw err;
  }

  await recordAuthEvent({
    type: 'account_created',
    userId: user.id,
    phoneE164: user.phoneE164,
    channel: input.channel,
    ip: input.meta?.ip,
    userAgent: input.meta?.userAgent,
  });
  for (const listener of accountCreatedListeners) {
    try {
      await listener(user);
    } catch (err) {
      // A failed welcome email must not undo the sign-up.
      console.error('account-created listener failed', err);
    }
  }
  return { user, created: true };
}

/** Maps the signing-in app to the channel recorded on a brand-new account. */
export function channelForClient(client: 'mobile' | 'web' | 'apk'): RegistrationChannel {
  return client === 'web' ? 'web' : 'mobile';
}
