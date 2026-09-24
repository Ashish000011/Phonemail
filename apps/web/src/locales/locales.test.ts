import { describe, expect, it } from 'vitest';
import en from './en.json';
import hi from './hi.json';
import ta from './ta.json';

/** Flattens {"a":{"b":"x"}} into ["a.b"]. */
function keys(object: object, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('translations', () => {
  const english = keys(en).sort();

  it.each([
    ['hi', hi],
    ['ta', ta],
  ])('%s has exactly the English keys', (_code, strings) => {
    expect(keys(strings).sort()).toEqual(english);
  });

  it.each([
    ['en', en],
    ['hi', hi],
    ['ta', ta],
  ])('%s has no empty strings', (_code, strings) => {
    expect(JSON.stringify(strings)).not.toMatch(/:""/);
  });
});
