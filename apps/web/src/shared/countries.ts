import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';

export interface Country {
  code: CountryCode;
  name: string;
  dialCode: string;
}

/** Every country libphonenumber knows, named in the UI language, India first. */
export function countryList(language: string): Country[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([language], { type: 'region' });
  } catch {
    names = null;
  }
  const all = getCountries().map((code) => ({
    code,
    name: names?.of(code) ?? code,
    dialCode: getCountryCallingCode(code),
  }));
  all.sort((a, b) =>
    a.code === 'IN' ? -1 : b.code === 'IN' ? 1 : a.name.localeCompare(b.name, language),
  );
  return all;
}
