import { m } from '../paraglide/messages.js';
import { CANONICAL_ORIGIN } from './canonical.ts';

type Share = {
  description: string;
  /** The share image and its alt text; the site's one image when left out. */
  image?: { alt: string; url: string } | undefined;
  /** The page's path, for `og:url`. */
  path?: string | undefined;
  title: string;
  /** `article` for a blog post. */
  type?: 'article' | 'website' | undefined;
};

/** The site's one share image, drawn by `scripts/og.ts`. */
export const IMAGE = `${CANONICAL_ORIGIN}/og.png`;

/** A blog post's own share image, drawn by `scripts/og.ts --posts`. */
export const postImage = (slug: string) => `${CANONICAL_ORIGIN}/og/blog/${slug}.png`;

/**
 * The Open Graph and X card tags for a page. The root route sets the
 * landing's, and a docs page or a post sets its own: TanStack keeps the
 * deepest route's tag of each name or property, so a page's tags replace the
 * root's rather than repeat them. The image's tags all come from here, so
 * `og:image` is written before its size, type and alt.
 */
export function shareMeta({ description, image, path, title, type = 'website' }: Share) {
  const { alt, url } = image ?? { alt: m.og_image_alt(), url: IMAGE };
  return [
    { content: m.app_name(), property: 'og:site_name' },
    { content: title, property: 'og:title' },
    { content: description, property: 'og:description' },
    { content: type, property: 'og:type' },
    ...(path === undefined ? [] : [{ content: `${CANONICAL_ORIGIN}${path}`, property: 'og:url' }]),
    { content: url, property: 'og:image' },
    { content: '1200', property: 'og:image:width' },
    { content: '630', property: 'og:image:height' },
    { content: 'image/png', property: 'og:image:type' },
    { content: alt, property: 'og:image:alt' },
    { content: 'summary_large_image', name: 'twitter:card' },
    { content: title, name: 'twitter:title' },
    { content: description, name: 'twitter:description' },
    { content: url, name: 'twitter:image' },
  ];
}
