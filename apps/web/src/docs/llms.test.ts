import { describe, expect, test } from 'vitest';
import { CANONICAL_ORIGIN } from '../lib/canonical.ts';
import { absolute, demote, reference } from './llms.ts';

/** The lines of a markdown text outside its fenced code blocks. */
const outsideFences = (text: string) =>
  text
    .split(/^```[\s\S]*?^```/gm)
    .join('')
    .split('\n');

const files = Object.keys(import.meta.glob('../../content/reference/*.md'));

describe('reference', () => {
  test('starts with the first page, every heading under the file heading', () => {
    const text = reference();
    expect(text.startsWith('## Reference: start\n')).toBe(true);
    expect(outsideFences(text).filter((line) => line.startsWith('# '))).toEqual([]);
  });

  test('one section per reference file, each heading in it below its ##', () => {
    const sections = reference().split(/^(?=## Reference: )/m);
    expect(files.length).toBeGreaterThan(0);
    expect(sections).toHaveLength(files.length);
    for (const section of sections) {
      const [title, ...rest] = outsideFences(section).filter((line) => /^#{1,6} /.test(line));
      expect(title).toMatch(/^## Reference: /);
      expect(rest.filter((line) => !line.startsWith('### ') && !/^#{4,6} /.test(line))).toEqual([]);
    }
  });
});

describe('demote', () => {
  test('moves headings one level down, and leaves code alone', () => {
    expect(demote('## install\n\n```sh\n# comment\nnpm i\n```\n\n### more')).toBe(
      '### install\n\n```sh\n# comment\nnpm i\n```\n\n#### more',
    );
  });
});

describe('absolute', () => {
  test('docs links get the origin, and keep a fragment only while the page has its heading', () => {
    expect(absolute('start', '[a](/docs/start#install) [b](/docs/start#gone) [c](/blog)')).toBe(
      `[a](${CANONICAL_ORIGIN}/docs/start#install) [b](${CANONICAL_ORIGIN}/docs/start) [c](${CANONICAL_ORIGIN}/blog)`,
    );
  });

  test('a bare fragment is on the same page', () => {
    expect(absolute('start', '[a](#install)')).toBe(`[a](${CANONICAL_ORIGIN}/docs/start#install)`);
  });
});
