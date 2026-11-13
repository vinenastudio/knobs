import { docFrontmatter } from '../docs/frontmatter.ts';
import { blogMarkdown, render } from '../docs/pages.ts';
import { pageTerms } from '../use/frontmatter.ts';
import type { UsePage } from '../use/pages.ts';

/**
 * The comparison pages: one markdown file each in `content/compare`, knobs
 * beside one other tool per page, with the use pages' frontmatter (`title`,
 * `meta_title`, `description`, `order`, `updated`, `terms`). Each is parsed
 * and rendered once, when this module loads.
 */

export type ComparePage = UsePage;

function parse(slug: string, source: string): ComparePage {
  const { body, description, metaTitle, order, title, updated } = docFrontmatter(slug, source);
  const { segments } = render(body, blogMarkdown);
  return {
    description,
    metaTitle,
    order,
    segments,
    slug,
    terms: pageTerms(slug, source),
    title,
    updated,
  };
}

const files = import.meta.glob<string>('../../content/compare/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});

/** Every comparison page, in `order`. */
export const comparePages: Array<ComparePage> = Object.entries(files)
  .map(([path, source]) => parse(path.slice(path.lastIndexOf('/') + 1, -'.md'.length), source))
  .toSorted((a, b) => a.order - b.order);

const bySlug = new Map(comparePages.map((page) => [page.slug, page]));

export function findComparePage(slug: string): ComparePage | undefined {
  return bySlug.get(slug);
}
