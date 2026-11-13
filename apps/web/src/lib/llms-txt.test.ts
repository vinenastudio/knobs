import { describe, expect, test, vi } from 'vitest';
import { llmsTxtConfig } from './llms-txt.config.ts';
import {
  createLlmsTxt,
  formatLlmsFullTxt,
  formatLlmsTxt,
  type LlmsTxtConfig,
  type Page,
  pagePaths,
  readPage,
  textResponse,
} from './llms-txt.ts';

// Only the product's names come from the app's config, so the tests pass whatever pages it adds.
const config: LlmsTxtConfig = {
  pagesTitle: llmsTxtConfig.pagesTitle,
  productName: llmsTxtConfig.productName,
  sections: [{ prefix: '/docs', title: 'Docs' }],
  siteUrl: llmsTxtConfig.siteUrl,
};

const url = (path: string) => new URL(path, config.siteUrl).href;

function page(path: string, title: string, description = ''): Page {
  return { description, markdown: `### ${title}\n\nBody of ${path}`, path, title, url: url(path) };
}

describe('pagePaths', () => {
  test('keeps static pages, home first, and drops params, server, dev, og, file and excluded routes', () => {
    expect(
      pagePaths(
        [
          '/features',
          '/',
          '/blog/$slug',
          '/ingest/$',
          '/api/health',
          '/dev/og',
          '/og',
          '/og-image',
          '/llms.txt',
          '/llms-full.txt',
          '/robots.txt',
          '/sitemap.xml',
          '/feed.xml',
          '/account',
          '/about/',
          '/docs',
        ],
        [],
        ['/account'],
      ),
    ).toStrictEqual(['/', '/about', '/docs', '/features']);
  });

  test('adds extra paths after the routes, without duplicates, and honors exclude', () => {
    expect(
      pagePaths(
        ['/', '/blog', '/legal', '/legal/terms'],
        ['/blog/first-post', '/blog', '/legal/privacy'],
        ['/legal'],
      ),
    ).toStrictEqual(['/', '/blog', '/blog/first-post']);
  });
});

describe('readPage', () => {
  const html = `<!doctype html><html><head><title>Features | Example</title><meta name="description" content="What  it costs."></head><body><header><a href="/">Example</a></header><main><h1>Features</h1><p>See <a href="/docs">the docs</a>.</p></main><footer>Footer</footer></body></html>`;

  test('takes the title, description and main content as markdown', () => {
    expect(readPage(html, url('/features'))).toStrictEqual({
      description: 'What it costs.',
      markdown: `### Features\n\nSee [the docs](${url('/docs')}).`,
      title: 'Features | Example',
      url: url('/features'),
    });
  });

  test('falls back to the h1 for a page with no title', () => {
    expect(readPage('<main><h1>Only heading</h1></main>', url('/x'))?.title).toBe('Only heading');
  });

  test('skips a noindex page', () => {
    expect(
      readPage('<head><meta name="robots" content="noindex"></head><main>x</main>', url('/')),
    ).toBeUndefined();
    expect(
      readPage(
        '<head><meta name="googlebot" content="noindex, follow"></head><main>x</main>',
        url('/'),
      ),
    ).toBeUndefined();
  });
});

describe('formatLlmsTxt', () => {
  test('header, summary from the home page, a link to the full file, and lists by section', () => {
    const pages = [
      page('/', 'Example', 'The home description.'),
      page('/features', 'Features', 'What it costs.'),
      page('/docs/start', 'Start'),
    ];
    expect(formatLlmsTxt(config, pages)).toBe(
      [
        `# ${config.productName}`,
        '> The home description.',
        `The full text of every page: [llms-full.txt](${url('/llms-full.txt')})`,
        `## ${config.pagesTitle}\n\n- [Example](${url('/')}): The home description.\n- [Features](${url('/features')}): What it costs.`,
        `## Docs\n\n- [Start](${url('/docs/start')})`,
      ].join('\n\n') + '\n',
    );
  });

  test('a summary in the config wins, empty sections are left out', () => {
    const text = formatLlmsTxt({ ...config, summary: 'Set by hand.' }, [
      page('/', 'Home', 'Ignored.'),
    ]);
    expect(text).toContain('\n\n> Set by hand.\n\n');
    expect(text).not.toContain('## Docs');
  });
});

test('details go under the summary in both files', () => {
  const withDetails = { ...config, details: '- Fact one\n- Fact two\n', summary: 'Summary.' };
  const pages = [page('/', 'Home')];
  const head = `# ${config.productName}\n\n> Summary.\n\n- Fact one\n- Fact two\n\n`;
  expect(formatLlmsTxt(withDetails, pages).startsWith(head)).toBe(true);
  expect(formatLlmsFullTxt(withDetails, pages).startsWith(head)).toBe(true);
});

test('a reference goes first in llms-full.txt, and llms.txt says so', () => {
  const withReference = {
    ...config,
    reference: () => '## CLI\n\n`example --help`\n',
    summary: 'Summary.',
  };
  const pages = [page('/', 'Home')];
  expect(formatLlmsFullTxt(withReference, pages)).toBe(
    `# ${config.productName}\n\n> Summary.\n\n## CLI\n\n\`example --help\`\n\n## Home\n\nURL: ${url('/')}\n\n### Home\n\nBody of /\n`,
  );
  expect(formatLlmsTxt(withReference, pages)).toContain(
    `The full reference for agents, then the text of every page: [llms-full.txt](${url('/llms-full.txt')})`,
  );
});

describe('formatLlmsFullTxt', () => {
  test('every page with its heading, URL and markdown', () => {
    expect(formatLlmsFullTxt(config, [page('/', 'Home', 'Summary.'), page('/a', 'A')])).toBe(
      [
        `# ${config.productName}`,
        '> Summary.',
        `## Home\n\nURL: ${url('/')}\n\n### Home\n\nBody of /`,
        `## A\n\nURL: ${url('/a')}\n\n### A\n\nBody of /a`,
      ].join('\n\n') + '\n',
    );
  });
});

function htmlFor(path: string): string {
  return `<html><head><title>${path}</title><meta name="description" content="About ${path}"></head><body><main><p>Text of ${path}</p></main></body></html>`;
}

describe('createLlmsTxt', () => {
  function source(cache: boolean) {
    const render = vi.fn(async (request: Request) => {
      const { pathname } = new URL(request.url);
      if (pathname === '/gone') {
        return new Response('missing', { headers: { 'content-type': 'text/html' }, status: 404 });
      }
      return new Response(htmlFor(pathname), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
    return { cache, render, routePaths: () => ['/', '/about', '/gone', '/blog/$slug'] };
  }

  test('renders each page once per isolate and skips pages that fail', async () => {
    const pages = source(true);
    const llms = createLlmsTxt({ ...config, extraPaths: async () => ['/blog/hello'] }, pages);
    const index = await llms.index();
    const full = await llms.full();
    expect(pages.render).toHaveBeenCalledTimes(4);
    expect(index).toContain(`- [/about](${url('/about')}): About /about`);
    expect(index).toContain(`- [/blog/hello](${url('/blog/hello')})`);
    expect(index).not.toContain('/gone');
    expect(full).toContain(`URL: ${url('/blog/hello')}\n\nText of /blog/hello`);
  });

  test('a server error fails the build, an x-robots-tag noindex page is skipped', async () => {
    const answer = (path: string, init: ResponseInit) =>
      createLlmsTxt(config, {
        cache: true,
        render: async (request) =>
          new URL(request.url).pathname === path
            ? new Response('x', init)
            : new Response(htmlFor('/'), { headers: { 'content-type': 'text/html' } }),
        routePaths: () => ['/', '/broken'],
      });
    await expect(answer('/broken', { status: 503 }).index()).rejects.toThrow(
      'llms-txt: /broken answered 503',
    );
    const index = await answer('/broken', {
      headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' },
    }).index();
    expect(index).not.toContain('/broken');
    expect(index).toContain(`(${url('/')})`);
  });

  test('route paths may come from a promise, as when the router loads lazily', async () => {
    const llms = createLlmsTxt(config, {
      cache: false,
      render: async (request) =>
        new Response(htmlFor(new URL(request.url).pathname), {
          headers: { 'content-type': 'text/html' },
        }),
      routePaths: async () => ['/', '/about'],
    });
    expect(await llms.index()).toContain(`- [/about](${url('/about')}): About /about`);
  });

  test('without cache, every call renders again', async () => {
    const pages = source(false);
    const llms = createLlmsTxt(config, pages);
    await llms.index();
    await llms.index();
    expect(pages.render).toHaveBeenCalledTimes(6);
  });
});

test('textResponse is plain text with a cache header', async () => {
  const response = textResponse('hi');
  expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
  expect(await response.text()).toBe('hi');
});

test('the use pages are listed, under their own section', async () => {
  const slugs = Object.keys(import.meta.glob('../../content/use/*.md')).map((path) =>
    path.slice(path.lastIndexOf('/') + 1, -'.md'.length),
  );
  expect(slugs).toEqual(expect.arrayContaining(['dark-mode', 'pseudolocalization']));
  const paths = (await llmsTxtConfig.extraPaths?.()) ?? [];
  expect(paths).toEqual(expect.arrayContaining(slugs.map((slug) => `/use/${slug}`)));
  expect(llmsTxtConfig.sections).toContainEqual({ prefix: '/use', title: 'Use cases' });
  const index = formatLlmsTxt(
    llmsTxtConfig,
    slugs.map((slug) => page(`/use/${slug}`, slug)),
  );
  expect(index).toContain(`## Use cases\n\n- [${slugs[0]}](${url(`/use/${slugs[0]}`)})`);
});
