/**
 * A deliberately simple, explainable spam score (docs/spec/04-mail-engine.md,
 * "Spam"). Each rule adds or removes points; 5 or more means Spam.
 */
export const SPAM_THRESHOLD = 5;

export const SPAM_PHRASES = [
  'you have won',
  'you won',
  'lottery',
  'claim your prize',
  'claim your reward',
  'act now',
  'free money',
  'wire transfer',
  'inheritance',
  'crypto investment',
  'double your money',
  'verify your account',
  'limited time offer',
  '100% free',
  'kyc update',
];

export interface SpamSignals {
  /** The user blocked this sender ("Report spam") */
  blocked: boolean;
  /** Sender is outside PhoneMail */
  external: boolean;
  /** Sender is a contact or already has a chat with this user */
  knownSender: boolean;
  linkCount: number;
  subject: string;
  text: string;
}

export function spamScore(signals: SpamSignals): number {
  let score = 0;
  if (signals.external && !signals.knownSender) score += 3;
  if (signals.linkCount > 5) score += 2;
  const letters = signals.subject.replace(/[^a-z]/gi, '');
  if (letters.length >= 5 && letters === letters.toUpperCase()) score += 2;
  const haystack = `${signals.subject} ${signals.text}`.toLowerCase();
  if (SPAM_PHRASES.some((phrase) => haystack.includes(phrase))) score += 3;
  if (signals.knownSender) score -= 5;
  return score;
}

export function isSpam(signals: SpamSignals): boolean {
  return signals.blocked || spamScore(signals) >= SPAM_THRESHOLD;
}
