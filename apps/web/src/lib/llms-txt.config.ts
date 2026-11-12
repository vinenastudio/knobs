import { reference } from '../docs/llms.ts';
import { CANONICAL_ORIGIN } from './canonical.ts';
import type { LlmsTxtConfig } from './llms-txt.ts';

/** The product's facts for the llms-txt block, from docs/product.md. */
export const llmsTxtConfig: LlmsTxtConfig = {
  details: `It emulates devices, locales, time, color schemes, network and motion settings from inside the page. Grab hands a coding agent an element with its html, components and source places, and an agent api lets a browser tool drive the knobs. A Chrome extension puts the same panel on any site and sets some knobs for real.

- [npm](https://www.npmjs.com/package/@vinena/knobs): the @vinena/knobs package
- [Chrome Web Store](https://chromewebstore.google.com/detail/knobs/cpdmafeojnbdnnhldafobkaajiemcidj): the knobs extension
- [GitHub](https://github.com/vinenastudio/knobs): the source of the package, the extension and this site`,
  // The docs pages and the blog posts, as the sitemap lists them.
  extraPaths: async () => {
    const [{ pages }, { posts }] = await Promise.all([
      import('../docs/pages.ts'),
      import('../blog/posts.ts'),
    ]);
    return [
      ...pages.map((page) => `/docs/${page.slug}`),
      ...posts.map((post) => `/blog/${post.slug}`),
    ];
  },
  pagesTitle: 'Pages',
  productName: 'knobs',
  reference,
  sections: [
    { prefix: '/docs', title: 'Docs' },
    { prefix: '/blog', title: 'Blog' },
  ],
  siteUrl: CANONICAL_ORIGIN,
  summary:
    'knobs is a dev-only panel inside the page that shows your site on an iPhone or a Pixel, tomorrow morning, in Arabic or in dark mode.',
};
