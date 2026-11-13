import { notFound } from '@tanstack/react-router';
import { CANONICAL_ORIGIN, canonicalLink } from '../lib/canonical.ts';
import { jsonLd, ORGANIZATION } from '../lib/schema.ts';
import { IMAGE, shareMeta } from '../lib/share.ts';
import { m } from '../paraglide/messages.js';
import type { UseMeta } from '../use/head.ts';

/**
 * The meta of a comparison page, or a not found for a slug with no page. The
 * pages load behind an `import()`, so the entry bundle does not carry them.
 */
export async function loadComparePage(slug: string): Promise<UseMeta> {
  const { findComparePage } = await import('./pages.ts');
  const page = findComparePage(slug);
  if (page === undefined) {
    throw notFound();
  }
  return {
    description: page.description,
    metaTitle: page.metaTitle,
    terms: page.terms,
    title: page.title,
    updated: page.updated,
  };
}

const crumb = (position: number, name: string, path: string) => ({
  '@type': 'ListItem',
  item: `${CANONICAL_ORIGIN}${path}`,
  name,
  position,
});

/** The `<head>` of `/compare`. */
export function compareIndexHead() {
  const title = m.compare_meta_title();
  const description = m.compare_description();
  return {
    links: [canonicalLink('/compare')],
    meta: [
      { title },
      { content: description, name: 'description' },
      ...shareMeta({ description, path: '/compare', title }),
    ],
    scripts: [
      jsonLd({
        '@type': 'BreadcrumbList',
        itemListElement: [crumb(1, m.app_name(), '/'), crumb(2, m.compare_heading(), '/compare')],
      }),
    ],
  };
}

/**
 * The `<head>` of a comparison page, as a use page's: its `meta_title` and
 * description, its share card, its canonical address, and its schema: a
 * TechArticle with its search terms as keywords, and its breadcrumbs.
 */
export function comparePageHead(page: UseMeta | undefined, slug: string) {
  if (page === undefined) {
    return {};
  }
  const path = `/compare/${slug}`;
  const title = page.metaTitle;
  return {
    links: [
      canonicalLink(path),
      { href: '/llms.txt', rel: 'alternate', title: 'llms.txt', type: 'text/plain' },
    ],
    meta: [
      { title },
      { content: page.description, name: 'description' },
      ...shareMeta({ description: page.description, path, title }),
    ],
    scripts: [
      jsonLd({
        '@type': 'TechArticle',
        author: ORGANIZATION,
        dateModified: page.updated,
        description: page.description,
        headline: title,
        image: IMAGE,
        inLanguage: 'en',
        keywords: page.terms.join(', '),
        mainEntityOfPage: `${CANONICAL_ORIGIN}${path}`,
        publisher: ORGANIZATION,
      }),
      jsonLd({
        '@type': 'BreadcrumbList',
        itemListElement: [
          crumb(1, m.app_name(), '/'),
          crumb(2, m.compare_heading(), '/compare'),
          crumb(3, page.title, path),
        ],
      }),
    ],
  };
}
