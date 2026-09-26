/**
 * The SMS for our own codes (docs/spec/03-auth-and-accounts.md). The last line,
 * "@host #code", is the WebOTP format: Chrome on Android reads the code from
 * it automatically when the site's host matches. Keep it last, in this shape.
 *
 * The first line is deliberately plain: Indian networks reject texts from a
 * personal SIM (SMSGate) that use bank-style OTP wording ("is your … code",
 * "expires in", "don't share"), tested on Airtel (DECISIONS 81).
 */
export function buildOtpSms(code: string, publicBaseUrl: string): string {
  const host = new URL(publicBaseUrl).host;
  return `PhoneMail sign-in: ${code}\n\n@${host} #${code}`;
}
