import { describe, expect, test } from 'vitest';
import { formatStars, readStars, STAR_COUNT_MIN, starsCacheKey } from './stars.ts';

describe('formatStars', () => {
  test('writes a count below 10,000 in full, with a comma', () => {
    expect(formatStars(STAR_COUNT_MIN)).toBe('100');
    expect(formatStars(999)).toBe('999');
    expect(formatStars(1234)).toBe('1,234');
    expect(formatStars(9999)).toBe('9,999');
  });

  test('writes a count from 10,000 in thousands, to one decimal, never rounded up', () => {
    expect(formatStars(10_000)).toBe('10k');
    expect(formatStars(12_345)).toBe('12.3k');
    expect(formatStars(12_399)).toBe('12.3k');
    expect(formatStars(123_456)).toBe('123.4k');
  });
});

describe('readStars', () => {
  test('reads a number', () => {
    expect(readStars({ stars: 1234 })).toBe(1234);
    expect(readStars({ stars: 0 })).toBe(0);
  });

  test('reads anything else as none', () => {
    expect(readStars({ stars: null })).toBeNull();
    expect(readStars({ stars: '12' })).toBeNull();
    expect(readStars({})).toBeNull();
    expect(readStars(null)).toBeNull();
    expect(readStars('nope')).toBeNull();
  });
});

describe('starsCacheKey', () => {
  test('drops the query, so every address shares one cached answer', () => {
    expect(starsCacheKey('https://knobs.dev/api/stars')).toBe('https://knobs.dev/api/stars');
    expect(starsCacheKey('https://knobs.dev/api/stars?x=1&y=2')).toBe(
      'https://knobs.dev/api/stars',
    );
    expect(starsCacheKey('https://knobs.dev/api/stars?')).toBe('https://knobs.dev/api/stars');
  });
});
