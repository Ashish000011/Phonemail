import { basename } from 'node:path';
import type { User } from '@prisma/client';
import type { Me } from '@phonemail/shared';
import { env } from '../../config/env.js';
import { formatAddress, formatPhone } from '../addressing/index.js';

export function avatarUrl(avatarPath: string | null): string | null {
  return avatarPath ? `/api/avatars/${basename(avatarPath)}` : null;
}

/** What the apps get to know about the signed-in user (never the password hash). */
export function toMeDto(user: User): Me {
  return {
    id: user.id,
    phoneE164: user.phoneE164,
    phoneDisplay: formatPhone(user.phoneE164),
    address: formatAddress(user.localPart, env.MAIL_DOMAIN),
    displayName: user.displayName,
    about: user.about,
    avatarUrl: avatarUrl(user.avatarPath),
    language: user.language,
    readReceipts: user.readReceipts,
    loadRemoteImages: user.loadRemoteImages,
    defaultSendAsAliasId: user.defaultSendAsAliasId,
    mustChangePassword: user.mustChangePassword,
    hasPassword: user.passwordHash !== null,
    registrationChannel: user.registrationChannel,
    createdAt: user.createdAt.toISOString(),
  };
}
