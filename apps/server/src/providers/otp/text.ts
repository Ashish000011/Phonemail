/**
 * The SMS for our own codes (docs/spec/03-auth-and-accounts.md). The last line,
 * "@host #code", is the WebOTP format: Chrome on Android reads the code from
 * it automatically when the site's host matches. Keep it last, in this shape.
 */
export function buildOtpSms(code: string, publicBaseUrl: string): string {
  const host = new URL(publicBaseUrl).host;
  return `${code} is your PhoneMail code. It expires in 5 minutes. Don't share it.\n\n@${host} #${code}`;
}
