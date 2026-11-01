/**
 * Fails when a page's `<head>` breaks the share rules: the home, `/blog`,
 * every post and every docs page, each merged under the root's head the way
 * TanStack merges them (the deepest route's tag of each name or property
 * wins). Each route's own list holds each tag once, posts are articles, `og:image` comes before its size, type and
 * alt, the X tags repeat the page's title and description, the title is 50 to
 * 60 characters and the description 120 to 160. Runs after `vite build` in
 * the web app's `build` script, which generates the messages it reads.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { postFrontmatter } from '../apps/web/src/blog/frontmatter.ts';
import { blogIndexHead, postHead } from '../apps/web/src/blog/head.ts';
import { docFrontmatter } from '../apps/web/src/docs/frontmatter.ts';
import { docHead } from '../apps/web/src/docs/head.ts';
import { shareMeta } from '../apps/web/src/lib/share.ts';
import { m } from '../apps/web/src/paraglide/messages.js';

type Meta = { content?: string; name?: string; property?: string; title?: string };

const content = path.resolve(import.meta.dirname, '../apps/web/content');
const read = (dir: string) =>
  readdirSync(path.join(content, dir))
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({
      slug: name.slice(0, -'.md'.length),
      source: readFileSync(path.join(content, dir, name), 'utf8'),
    }));

const root: Array<Meta> = [
  { content: m.home_description(), name: 'description' },
  { title: m.home_title() },
  ...shareMeta({ description: m.home_description(), title: m.home_title() }),
];

/** A tag's name or property, or `title` for the title. */
const key = (tag: Meta) => (tag.title === undefined ? (tag.name ?? tag.property) : 'title');

/** The root's tags with the page's over them, as TanStack writes them. */
function merge(page: Array<Meta>): Array<Meta> {
  const out: Array<Meta> = [];
  const seen = new Set<string>();
  for (const tag of [...root, ...page].reverse()) {
    const k = key(tag);
    if (k !== undefined && seen.has(k)) {
      continue;
    }
    if (k !== undefined) {
      seen.add(k);
    }
    out.push(tag);
  }
  return out.reverse();
}

const pages: Array<[string, Array<Meta>]> = [
  ['/', []],
  ['/blog', blogIndexHead().meta],
  ...read('blog').map(({ slug, source }): [string, Array<Meta>] => {
    const post = postFrontmatter(slug, source);
    return [`/blog/${slug}`, postHead({ ...post, faq: [] }, slug).meta ?? []];
  }),
  ...read('docs').map(({ slug, source }): [string, Array<Meta>] => [
    `/docs/${slug}`,
    docHead({ ...docFrontmatter(slug, source), faq: [] }, slug).meta ?? [],
  ]),
];

let bad = 0;
for (const [url, page] of pages) {
  const fail = (message: string) => {
    bad += 1;
    process.stderr.write(`head-check: ${url} ${message}\n`);
  };
  // TanStack drops a repeat across routes, but a route's own list must hold each tag once.
  for (const own of [root, page]) {
    const ownKeys = own.map(key);
    const twice = ownKeys.filter((k, index) => k !== undefined && ownKeys.indexOf(k) !== index);
    if (twice.length > 0) {
      fail(`repeats ${twice.join(', ')}`);
    }
  }
  const tags = merge(page);
  const keys = tags.map(key);
  const get = (key: string) => tags.find((tag) => (tag.name ?? tag.property) === key)?.content;
  const title = tags.find((tag) => tag.title !== undefined)?.title ?? '';
  const description = get('description') ?? '';
  if (title.length < 50 || title.length > 60) {
    fail(`title is ${title.length} characters, needs 50 to 60`);
  }
  if (description.length < 120 || description.length > 160) {
    fail(`description is ${description.length} characters, needs 120 to 160`);
  }
  for (const [key, value] of [
    ['og:title', title],
    ['twitter:title', title],
    ['og:description', description],
    ['twitter:description', description],
  ]) {
    if (get(key ?? '') !== value) {
      fail(`${key} is not the page's own`);
    }
  }
  const image = keys.indexOf('og:image');
  for (const key of ['og:image:width', 'og:image:height', 'og:image:type', 'og:image:alt']) {
    if (image === -1 || keys.indexOf(key) < image) {
      fail(`${key} is missing or comes before og:image`);
    }
  }
  if (get('og:type') !== (url.startsWith('/blog/') ? 'article' : 'website')) {
    fail(`og:type is ${get('og:type')}`);
  }
  if (get('twitter:image') !== get('og:image') || get('og:site_name') === undefined) {
    fail('needs twitter:image equal to og:image and og:site_name');
  }
}

if (bad > 0) {
  process.exit(1);
}
process.stdout.write(`head-check: ${pages.length} pages have complete share tags.\n`);
