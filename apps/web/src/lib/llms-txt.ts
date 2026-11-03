import { findElement, parseHtml, textContent, toMarkdown } from './html-to-markdown.ts';

interface LlmsTxtSection {
  /** Pages whose path is this prefix or under it go in this section. */
  prefix: string;
  title: string;
}

export interface LlmsTxtConfig {
  /** Markdown under the summary in both files, before the pages: the product's facts for an agent. */
  details?: string;
  /** More paths to leave out. An entry matches the path and every path under it. */
  exclude?: ReadonlyArray<string>;
  /** Dynamic pages the route tree cannot list: blog posts, docs pages. */
  extraPaths?: () => ReadonlyArray<string> | Promise<ReadonlyArray<string>>;
  /** The heading of the pages no section claims. */
  pagesTitle: string;
  productName: string;
  /** A reference for agents written apart from the pages (a CLI help, the MCP setup), first in llms-full.txt. */
  reference?: () => string;
  /** Sections by path prefix, in the order they print. Other pages go under `pagesTitle`. */
  sections?: ReadonlyArray<LlmsTxtSection>;
  siteUrl: string;
  /** The line under the title. Default: the home page's meta description. */
  summary?: string;
}

export interface Page {
  description: string;
  markdown: string;
  path: string;
  title: string;
  url: string;
}

/** Routes that are not pages: server routes, dev tools, share images and these files themselves. */
const NOT_PAGES = [
  '/api',
  '/ingest',
  '/dev',
  '/llms.txt',
  '/llms-full.txt',
  '/robots.txt',
  '/sitemap.xml',
];

function under(path: string, prefix: string): boolean {
  const base = prefix.replace(/\/+$/, '');
  return base === '' ? true : path === base || path.startsWith(`${base}/`);
}

function normalizePath(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? '';
  const withSlash = clean.startsWith('/') ? clean : `/${clean}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

/** The pages to describe: static routes (no `$` params, no server or auth routes) plus the config's extra paths, home first. */
export function pagePaths(
  routePaths: Iterable<string>,
  extraPaths: ReadonlyArray<string>,
  exclude: ReadonlyArray<string> = [],
): Array<string> {
  const skipped = [...NOT_PAGES, ...exclude];
  const isPage = (path: string) => {
    const segments = path.split('/').filter(Boolean);
    const last = segments.at(-1) ?? '';
    return (
      !segments.some((segment) => segment.includes('$') || segment.startsWith('_')) &&
      !/^og\b/.test(segments[0] ?? '') &&
      !/\.[a-z\d]+$/i.test(last) &&
      !skipped.some((prefix) => under(path, prefix))
    );
  };
  const statics = [...new Set([...routePaths].map(normalizePath))]
    .filter(isPage)
    .toSorted((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
  const extras = extraPaths
    .map(normalizePath)
    .filter((path) => !skipped.some((prefix) => under(path, prefix)));
  return [...new Set([...statics, ...extras])];
}

function isNoindex(value: string | null | undefined): boolean {
  return /\bnoindex\b/i.test(value ?? '');
}

function clean(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

/** Reads one rendered page. Undefined for a page that asks not to be indexed. */
export function readPage(html: string, url: string): Omit<Page, 'path'> | undefined {
  const document = parseHtml(html);
  const meta = (name: string) =>
    findElement(
      document,
      (element) => element.tag === 'meta' && element.attrs['name']?.toLowerCase() === name,
    )?.attrs['content'];
  if (isNoindex(meta('robots')) || isNoindex(meta('googlebot'))) {
    return undefined;
  }
  const main =
    findElement(document, (element) => element.tag === 'main') ??
    findElement(document, (element) => element.tag === 'body') ??
    document;
  const titleElement = findElement(document, (element) => element.tag === 'title');
  const h1 = findElement(main, (element) => element.tag === 'h1');
  return {
    description: clean(meta('description') ?? ''),
    markdown: toMarkdown(main, { base: url, headingOffset: 2 }),
    title: clean(titleElement ? textContent(titleElement) : '') || clean(h1 ? textContent(h1) : ''),
    url,
  };
}

function absoluteUrl(config: LlmsTxtConfig, path: string): string {
  return new URL(path, config.siteUrl).href;
}

function header(config: LlmsTxtConfig, pages: ReadonlyArray<Page>): Array<string> {
  const summary = config.summary ?? pages.find((page) => page.path === '/')?.description ?? '';
  return [
    `# ${config.productName}`,
    ...(summary ? [`> ${summary}`] : []),
    ...(config.details ? [config.details.trim()] : []),
  ];
}

/** `/llms.txt`: the product, its summary and a linked list of every page, by section. */
export function formatLlmsTxt(config: LlmsTxtConfig, pages: ReadonlyArray<Page>): string {
  const sections = config.sections ?? [];
  const groups = new Map<string, Array<Page>>([[config.pagesTitle, []]]);
  for (const section of sections) {
    groups.set(section.title, []);
  }
  for (const page of pages) {
    const section = sections.find((candidate) => under(page.path, candidate.prefix));
    groups.get(section?.title ?? config.pagesTitle)?.push(page);
  }
  const lists = [...groups]
    .filter(([, members]) => members.length > 0)
    .map(
      ([title, members]) =>
        `## ${title}\n\n${members
          .map(
            (page) =>
              `- [${page.title || page.path}](${page.url})${page.description ? `: ${page.description}` : ''}`,
          )
          .join('\n')}`,
    );
  return `${[
    ...header(config, pages),
    `${config.reference ? 'The full reference for agents, then the text of every page' : 'The full text of every page'}: [llms-full.txt](${absoluteUrl(config, '/llms-full.txt')})`,
    ...lists,
  ].join('\n\n')}\n`;
}

/** `/llms-full.txt`: the same header, the reference when there is one, then every page's title, URL and content as markdown. */
export function formatLlmsFullTxt(config: LlmsTxtConfig, pages: ReadonlyArray<Page>): string {
  const bodies = pages.map((page) =>
    [`## ${page.title || page.path}`, `URL: ${page.url}`, page.markdown]
      .filter(Boolean)
      .join('\n\n'),
  );
  const reference = config.reference?.().trim();
  return `${[...header(config, pages), ...(reference ? [reference] : []), ...bodies].join('\n\n')}\n`;
}

export interface PageSource {
  /** Off in development, so an edited page shows on the next request. */
  cache: boolean;
  /** Renders a page in the app's own server handler, without the network. */
  render: (request: Request) => Promise<Response>;
  /** Every path in the app's route tree. It may load the router lazily, out of a chunk cycle. */
  routePaths: () => Iterable<string> | Promise<Iterable<string>>;
}

async function collectPages(config: LlmsTxtConfig, source: PageSource): Promise<Array<Page>> {
  const paths = pagePaths(
    await source.routePaths(),
    (await config.extraPaths?.()) ?? [],
    config.exclude,
  );
  const pages = await Promise.all(
    paths.map(async (path): Promise<Page | undefined> => {
      const url = absoluteUrl(config, path);
      const response = await source.render(new Request(url, { headers: { accept: 'text/html' } }));
      if (response.status >= 500) {
        await response.body?.cancel();
        throw new Error(`llms-txt: ${path} answered ${response.status}`);
      }
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('text/html') ||
        isNoindex(response.headers.get('x-robots-tag'))
      ) {
        await response.body?.cancel();
        return undefined;
      }
      const page = readPage(await response.text(), url);
      return page ? { ...page, path } : undefined;
    }),
  );
  return pages.filter((page) => page !== undefined);
}

/** Both files, built from the pages once per isolate when `source.cache` is on. */
export function createLlmsTxt(config: LlmsTxtConfig, source: PageSource) {
  let cached: Promise<Array<Page>> | undefined;
  const pages = () => {
    if (!source.cache) {
      return collectPages(config, source);
    }
    cached ??= collectPages(config, source).catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
    return cached;
  };
  return {
    full: async () => formatLlmsFullTxt(config, await pages()),
    index: async () => formatLlmsTxt(config, await pages()),
  };
}

export function textResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}
