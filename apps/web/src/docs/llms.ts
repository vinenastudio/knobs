import { CANONICAL_ORIGIN } from '../lib/canonical.ts';
import { type Frontmatter, frontmatter, slugify } from './frontmatter.ts';

/**
 * The full text of the docs for agents, from `content/reference`, kept apart
 * from the human docs pages so those can stay short. It goes first in
 * `/llms-full.txt` (`src/lib/llms-txt.config.ts`), before every page.
 */

type Doc = Frontmatter & { slug: string };

const glob = (files: Record<string, string>): Array<Doc> =>
  Object.entries(files)
    .map(([path, source]) => {
      const slug = path.slice(path.lastIndexOf('/') + 1, -'.md'.length);
      return { slug, ...frontmatter(slug, source) };
    })
    .toSorted((a, b) => a.order - b.order);

const references = glob(
  import.meta.glob<string>('../../content/reference/*.md', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
);

/** The short human pages, which the links point at. */
const pages = glob(
  import.meta.glob<string>('../../content/docs/*.md', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
);

/** The h2 and h3 ids of each human page, outside its code blocks. */
const anchors = new Map(
  pages.map((page) => [
    page.slug,
    new Set(
      Array.from(
        page.body.replaceAll(/^```[\s\S]*?^```/gm, '').matchAll(/^#{2,3} (.+)$/gm),
        (match) => slugify(match[1] ?? ''),
      ),
    ),
  ]),
);

/**
 * The reference links at the human pages, with the origin. A fragment stays
 * only where that page still has the heading; a bare `#x` is on the same page.
 */
const absolute = (slug: string, body: string) =>
  body
    .replaceAll(
      /\]\((?:\/docs\/([a-z0-9-]+))?#([a-z0-9-]+)\)/g,
      (_, target: string | undefined, id: string) => {
        const page = target ?? slug;
        const hash = anchors.get(page)?.has(id) === true ? `#${id}` : '';
        return `](${CANONICAL_ORIGIN}/docs/${page}${hash})`;
      },
    )
    .replaceAll('](/', `](${CANONICAL_ORIGIN}/`);

/** Every heading one level down, outside code blocks, so a page's `##` sits under its own `##` title. */
const demote = (body: string) =>
  body
    .split(/(^```[\s\S]*?^```)/gm)
    .map((part) => (part.startsWith('```') ? part : part.replaceAll(/^(#{1,5}) /gm, '#$1 ')))
    .join('');

/** Each reference page as `## Reference: <title>`, its description, and its text. */
export const reference = (): string =>
  references
    .map(
      (page) =>
        `## Reference: ${page.title}\n\n${page.description}\n\n${demote(absolute(page.slug, page.body)).trim()}`,
    )
    .join('\n\n');
