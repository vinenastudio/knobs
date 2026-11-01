/**
 * Fails when a docs page's frontmatter is missing a key or has a bad one
 * (`title`, `meta_title`, `description`, `order`, `updated`), or when its
 * `meta_title`, the page's `<title>`, is not 50 to 60 characters long or its
 * description, the page's meta description, is not 120 to 160. The Worker reads the pages when
 * it first loads them, so without this a bad page would build fine and then
 * fail every `/docs/*` request and `/sitemap.xml`. Runs after `vite build` in
 * the web app's `build` script.
 *
 * It checks the blog posts in `content/blog` the same way: `title`,
 * `description`, `slug` (the file's name), `date` and `updated` (real days),
 * every faq question with an answer, and no draft left in: no `[VERIFY]` mark
 * and no "Notes for the editor". A post's title, its `<title>`, is 50 to 60
 * characters, and its share image, `public/og/blog/<slug>.png` from
 * `scripts/og.ts --posts`, is a 1200 by 630 PNG.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { postFrontmatter } from '../apps/web/src/blog/frontmatter.ts';
import { docFrontmatter } from '../apps/web/src/docs/frontmatter.ts';

const docs = path.resolve(import.meta.dirname, '../apps/web/content/docs');
const blog = path.resolve(import.meta.dirname, '../apps/web/content/blog');
const og = path.resolve(import.meta.dirname, '../apps/web/public/og/blog');

let bad = 0;
function fail(message: string) {
  bad += 1;
  process.stderr.write(`docs-check: ${message}\n`);
}

/** The `<title>` length rule: 50 to 60 characters. */
function checkTitle(name: string, title: string) {
  if (title.length < 50 || title.length > 60) {
    fail(`${name} title is ${title.length} characters, needs 50 to 60`);
  }
}

/** The width and height in a PNG's header, or undefined for a missing file or another format. */
function pngSize(file: string): [number, number] | undefined {
  try {
    const head = readFileSync(file).subarray(0, 24);
    return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? [head.readUInt32BE(16), head.readUInt32BE(20)]
      : undefined;
  } catch {
    return undefined;
  }
}

const files = readdirSync(docs).filter((name) => name.endsWith('.md'));
for (const name of files) {
  try {
    const { description, metaTitle } = docFrontmatter(
      name.slice(0, -'.md'.length),
      readFileSync(path.join(docs, name), 'utf8'),
    );
    checkTitle(name, metaTitle);
    if (description.length < 120 || description.length > 160) {
      bad += 1;
      process.stderr.write(
        `docs-check: ${name} description is ${description.length} characters, needs 120 to 160\n`,
      );
    }
  } catch (error) {
    bad += 1;
    process.stderr.write(`docs-check: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

const postFiles = readdirSync(blog).filter((name) => name.endsWith('.md'));
for (const name of postFiles) {
  try {
    const source = readFileSync(path.join(blog, name), 'utf8');
    const slug = name.slice(0, -'.md'.length);
    const { title } = postFrontmatter(slug, source);
    checkTitle(name, title);
    const size = pngSize(path.join(og, `${slug}.png`));
    if (size?.[0] !== 1200 || size[1] !== 630) {
      fail(
        `${name} needs its share image, public/og/blog/${slug}.png at 1200 by 630: run pnpm og --posts`,
      );
    }
    if (source.includes('[VERIFY]') || /notes for the editor/i.test(source)) {
      bad += 1;
      process.stderr.write(`docs-check: ${name} is a draft: it has [VERIFY] or editor notes\n`);
    }
  } catch (error) {
    bad += 1;
    process.stderr.write(`docs-check: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (bad > 0) {
  process.exit(1);
}
process.stdout.write(
  `docs-check: ${files.length} docs pages and ${postFiles.length} blog posts have valid frontmatter.\n`,
);
