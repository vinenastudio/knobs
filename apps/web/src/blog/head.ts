import { notFound } from '@tanstack/react-router';
import { CANONICAL_ORIGIN, canonicalLink } from '../lib/canonical.ts';
import { jsonLd, ORGANIZATION } from '../lib/schema.ts';
import { postImage, shareMeta } from '../lib/share.ts';
import { m } from '../paraglide/messages.js';
import type { Post } from './posts.ts';

export type PostMeta = Pick<Post, 'date' | 'description' | 'faq' | 'title' | 'updated'>;

/**
 * The meta of a post, or a not found for a slug with no post. The posts load
 * behind an `import()`, so the entry bundle does not carry them.
 */
export async function loadPost(slug: string): Promise<PostMeta> {
  const { findPost } = await import('./posts.ts');
  const post = findPost(slug);
  if (post === undefined) {
    throw notFound();
  }
  return {
    date: post.date,
    description: post.description,
    faq: post.faq,
    title: post.title,
    updated: post.updated,
  };
}

const crumb = (position: number, name: string, path: string) => ({
  '@type': 'ListItem',
  item: `${CANONICAL_ORIGIN}${path}`,
  name,
  position,
});

/** The `<head>` of `/blog`. */
export function blogIndexHead() {
  const title = m.blog_meta_title();
  const description = m.blog_description();
  return {
    links: [canonicalLink('/blog')],
    meta: [
      { title },
      { content: description, name: 'description' },
      ...shareMeta({ description, path: '/blog', title }),
    ],
    scripts: [
      jsonLd({
        '@type': 'BreadcrumbList',
        itemListElement: [crumb(1, m.app_name(), '/'), crumb(2, m.blog_heading(), '/blog')],
      }),
    ],
  };
}

/**
 * The `<head>` of a post: its title alone (a suffix would push it past 60
 * characters), its description, share card, canonical address, and its schema:
 * a BlogPosting, its breadcrumbs, and a FAQPage from the questions it shows.
 */
export function postHead(post: PostMeta | undefined, slug: string) {
  if (post === undefined) {
    return {};
  }
  const path = `/blog/${slug}`;
  const url = `${CANONICAL_ORIGIN}${path}`;
  const image = postImage(slug);
  return {
    links: [canonicalLink(path)],
    meta: [
      { title: post.title },
      { content: post.description, name: 'description' },
      ...shareMeta({
        description: post.description,
        image: { alt: m.og_post_image_alt({ title: post.title }), url: image },
        path,
        title: post.title,
        type: 'article',
      }),
      { content: post.date, property: 'article:published_time' },
      { content: post.updated, property: 'article:modified_time' },
    ],
    scripts: [
      jsonLd({
        '@type': 'BlogPosting',
        author: ORGANIZATION,
        dateModified: post.updated,
        datePublished: post.date,
        description: post.description,
        headline: post.title,
        image,
        inLanguage: 'en',
        mainEntityOfPage: { '@id': url, '@type': 'WebPage' },
        publisher: ORGANIZATION,
        url,
      }),
      jsonLd({
        '@type': 'BreadcrumbList',
        itemListElement: [
          crumb(1, m.app_name(), '/'),
          crumb(2, m.blog_heading(), '/blog'),
          crumb(3, post.title, path),
        ],
      }),
      ...(post.faq.length === 0
        ? []
        : [
            jsonLd({
              '@type': 'FAQPage',
              mainEntity: post.faq.map(({ answer, question }) => ({
                '@type': 'Question',
                acceptedAnswer: { '@type': 'Answer', text: answer },
                name: question,
              })),
            }),
          ]),
    ],
  };
}
