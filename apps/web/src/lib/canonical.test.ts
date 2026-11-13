import { describe, expect, test } from 'vitest';
import { docsRedirect } from './canonical.ts';

describe('docsRedirect', () => {
  test.each(['/docs', '/docs/'])('moves %s to /docs/start for good', (path) => {
    const response = docsRedirect(new URL(`https://knobs.dev${path}`));
    expect(response?.status).toBe(301);
    expect(response?.headers.get('location')).toBe('/docs/start');
  });

  test('keeps the query', () => {
    const response = docsRedirect(new URL('https://knobs.dev/docs?x=1'));
    expect(response?.headers.get('location')).toBe('/docs/start?x=1');
  });

  test('leaves every docs page alone', () => {
    expect(docsRedirect(new URL('https://knobs.dev/docs/start'))).toBeNull();
    expect(docsRedirect(new URL('https://knobs.dev/docsx'))).toBeNull();
  });
});
