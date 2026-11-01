import { notFound } from '@tanstack/react-router';
import { CANONICAL_ORIGIN, canonicalLink } from '../lib/canonical.ts';
import { jsonLd, ORGANIZATION } from '../lib/schema.ts';
import { IMAGE, shareMeta } from '../lib/share.ts';
import type { Page } from './pages.ts';

/** The page `/docs` shows. */
export const FIRST = 'start';

export type DocMeta = Pick<Page, 'description' | 'faq' | 'metaTitle' | 'title' | 'updated'>;

/**
 * The title and description of a docs page, or a not found for a slug with no
 * page. The pages load behind an `import()`: the entry bundle holds every
 * route's loader and head, and the landing should not carry the docs.
 */
export async function loadDoc(slug: string): Promise<DocMeta> {
  const { findPage } = await import('./pages.ts');
  const page = findPage(slug);
  if (page === undefined) {
    throw notFound();
  }
  return {
    description: page.description,
    faq: page.faq,
    metaTitle: page.metaTitle,
    title: page.title,
    updated: page.updated,
  };
}

/**
 * The `<head>` of a docs page: its `meta_title` and its description, from its
 * frontmatter, its share card, its canonical address, the text for agents, and
 * its schema: a TechArticle, and a FAQPage built from the questions the page
 * shows. `/docs` shows the first page, so its canonical address is that page's.
 */
export function docHead(doc: DocMeta | undefined, slug: string) {
  if (doc === undefined) {
    return {};
  }
  const path = `/docs/${slug}`;
  const title = doc.metaTitle;
  return {
    links: [
      canonicalLink(path),
      { href: '/llms.txt', rel: 'alternate', title: 'llms.txt', type: 'text/plain' },
    ],
    meta: [
      { title },
      { content: doc.description, name: 'description' },
      ...shareMeta({ description: doc.description, path, title }),
    ],
    scripts: [
      jsonLd({
        '@type': 'TechArticle',
        author: ORGANIZATION,
        dateModified: doc.updated,
        description: doc.description,
        headline: title,
        image: IMAGE,
        inLanguage: 'en',
        mainEntityOfPage: `${CANONICAL_ORIGIN}${path}`,
        publisher: ORGANIZATION,
      }),
      ...(doc.faq.length === 0
        ? []
        : [
            jsonLd({
              '@type': 'FAQPage',
              mainEntity: doc.faq.map(({ answer, question }) => ({
                '@type': 'Question',
                acceptedAnswer: { '@type': 'Answer', text: answer },
                name: question,
              })),
            }),
          ]),
    ],
  };
}
