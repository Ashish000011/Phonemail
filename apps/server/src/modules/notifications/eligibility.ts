/**
 * The SMS alert rule (docs/spec/06): when an email arrives for user U, send U
 * an SMS if and only if U has no active mobile session. This file holds the
 * parts that don't need the database; the worker adds the session check.
 */
export interface AlertCandidate {
  direction: 'incoming' | 'outgoing';
  isSpam: boolean;
  /** Welcome mail and bounce notices */
  system: boolean;
  userId: string;
  senderUserId: string | null;
}

export type AlertDecision =
  | { send: true }
  | { send: false; reason: 'not-incoming' | 'spam' | 'system' | 'own-email' | 'has-mobile-app' };

export function alertDecision(entry: AlertCandidate, hasMobileSession: boolean): AlertDecision {
  if (entry.direction !== 'incoming') return { send: false, reason: 'not-incoming' };
  if (entry.isSpam) return { send: false, reason: 'spam' };
  if (entry.system) return { send: false, reason: 'system' };
  if (entry.senderUserId === entry.userId) return { send: false, reason: 'own-email' };
  // The heart of the rule: people with the mobile app already see it live.
  if (hasMobileSession) return { send: false, reason: 'has-mobile-app' };
  return { send: true };
}
