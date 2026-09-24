import { describe, expect, it } from 'vitest';
import { describeDevice } from './device';

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0 Safari/537.36 Edg/129.0',
      'Edge · Windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox · Linux'],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
      'Samsung Internet · Android',
    ],
  ])('%s', (userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it('returns null when there is nothing to go on', () => {
    expect(describeDevice(null)).toBeNull();
    expect(describeDevice('curl/8.4.0')).toBeNull();
  });
});
