import { docFrontmatter } from '../docs/frontmatter.ts';
import { blogMarkdown, render, type Segment } from '../docs/pages.ts';
import { pageTerms } from './frontmatter.ts';

/**
 * The use pages: one markdown file each in `content/use`, one knob per page,
 * with the docs' frontmatter (`title`, `meta_title`, `description`, `order`,
 * `updated`) and `terms`, the search terms the page is written for. Each is
 * parsed and rendered once, when this module loads.
 */

export type UsePage = {
  description: string;
  /** The page's `<title>`, from its `meta_title`. */
  metaTitle: string;
  order: number;
  segments: Array<Segment>;
  slug: string;
  /** The search terms the page is written for, from its `terms`. */
  terms: Array<string>;
  title: string;
  /** The day the page's content last changed, `YYYY-MM-DD`. */
  updated: string;
};

function parse(slug: string, source: string): UsePage {
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

const files = import.meta.glob<string>('../../content/use/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});

/** Every use page, in `order`. */
export const knobPages: Array<UsePage> = Object.entries(files)
  .map(([path, source]) => parse(path.slice(path.lastIndexOf('/') + 1, -'.md'.length), source))
  .toSorted((a, b) => a.order - b.order);

const bySlug = new Map(knobPages.map((page) => [page.slug, page]));

export function findKnobPage(slug: string): UsePage | undefined {
  return bySlug.get(slug);
}
