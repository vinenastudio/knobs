import { notFound } from '@tanstack/react-router';
import { CANONICAL_ORIGIN, canonicalLink } from '../lib/canonical.ts';
import { jsonLd, ORGANIZATION } from '../lib/schema.ts';
import { IMAGE, shareMeta } from '../lib/share.ts';
import { m } from '../paraglide/messages.js';
import type { UsePage } from './pages.ts';

export type UseMeta = Pick<UsePage, 'description' | 'metaTitle' | 'terms' | 'title' | 'updated'>;

/**
 * The meta of a use page, or a not found for a slug with no page. The pages
 * load behind an `import()`, so the entry bundle does not carry them.
 */
export async function loadKnobPage(slug: string): Promise<UseMeta> {
  const { findKnobPage } = await import('./pages.ts');
  const page = findKnobPage(slug);
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

/** The `<head>` of `/use`. */
export function knobIndexHead() {
  const title = m.use_meta_title();
  const description = m.use_description();
  return {
    links: [canonicalLink('/use')],
    meta: [
      { title },
      { content: description, name: 'description' },
      ...shareMeta({ description, path: '/use', title }),
    ],
    scripts: [
      jsonLd({
        '@type': 'BreadcrumbList',
        itemListElement: [crumb(1, m.app_name(), '/'), crumb(2, m.use_heading(), '/use')],
      }),
    ],
  };
}

/**
 * The `<head>` of a use page: its `meta_title` and description, its share
 * card, its canonical address, and its schema: a TechArticle, as the docs
 * pages have, with its search terms as keywords, and its breadcrumbs.
 */
export function knobPageHead(page: UseMeta | undefined, slug: string) {
  if (page === undefined) {
    return {};
  }
  const path = `/use/${slug}`;
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
          crumb(2, m.use_heading(), '/use'),
          crumb(3, page.title, path),
        ],
      }),
    ],
  };
}
