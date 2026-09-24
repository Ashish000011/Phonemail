/**
 * The primary-address rule, shared so the server and the UIs agree
 * (docs/spec/02-data-model.md): India uses the plain 10-digit number
 * (9876543210@...), everyone else 00 + country code + number
 * (0014155550123@...). Indian mobile numbers never start with 0, so the
 * two formats can never collide.
 */
export function localPartFor(countryCallingCode: string, nationalNumber: string): string {
  return countryCallingCode === '91' ? nationalNumber : `00${countryCallingCode}${nationalNumber}`;
}
