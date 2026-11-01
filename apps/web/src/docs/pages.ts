import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, props, type StyleXStyles } from '@stylexjs/stylex';
import { Marked, type RendererObject, type Token, type TokensList } from 'marked';
import { docFrontmatter, slugify } from './frontmatter.ts';
import { highlight } from './highlight.ts';

/**
 * The docs pages: one markdown file each in `content/docs`, with `title`,
 * `description` and `order` in its frontmatter. Each is parsed and rendered
 * once, when this module loads, not per request.
 */

/** A run of rendered markdown, or a code block, which the page draws with its copy button. */
export type Segment = { id: number } & (
  | { html: string; kind: 'html' }
  | { code: string; html: string | undefined; kind: 'code' }
);

export type Heading = { id: string; text: string };

/** A question and its answer from a page's `## faq` section, as plain text, for its FAQPage schema. */
export type Faq = { answer: string; question: string };

export type Page = {
  description: string;
  faq: Array<Faq>;
  /** The page's h2s, for "on this page". */
  headings: Array<Heading>;
  /** The page's `<title>`, from its `meta_title`. */
  metaTitle: string;
  order: number;
  segments: Array<Segment>;
  slug: string;
  title: string;
  /** The day the page's content last changed, `YYYY-MM-DD`. */
  updated: string;
};

export const prose = create({
  blockquote: {
    backgroundColor: colors.card,
    borderRadius: radius.row,
    color: colors.muted,
    marginBlock: '1rem',
    marginInline: 0,
    paddingBlock: '1px',
    paddingInline: spacing.s4,
  },
  cell: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    paddingBlock: '6px',
    paddingInline: '0 12px',
    textAlign: 'start',
    verticalAlign: 'top',
  },
  code: {
    backgroundColor: colors.card,
    borderRadius: radius.base,
    fontFamily: font.mono,
    fontSize: '0.85em',
    overflowWrap: 'break-word',
    paddingBlock: '0.1em',
    paddingInline: '0.3em',
  },
  h2: {
    fontSize: '1.125rem',
    fontWeight: font.weightMedium,
    letterSpacing: '-0.01em',
    lineHeight: 1.4,
    marginBlock: '2.25rem 0.5rem',
    scrollMarginTop: spacing.s4,
  },
  h3: {
    fontSize: '0.9375rem',
    fontWeight: font.weightMedium,
    lineHeight: 1.5,
    marginBlock: '1.5rem 0.25rem',
    scrollMarginTop: spacing.s4,
  },
  head: {
    borderTopStyle: 'none',
    color: colors.muted,
    fontWeight: font.weightRegular,
  },
  li: {
    marginBlock: '0.25rem',
  },
  // The theme's global `a` rules set the link's color, so the accent sits on the text inside it.
  linkText: {
    color: colors.link,
  },
  list: {
    marginBlock: '0.75rem',
    paddingInlineStart: '1.25rem',
  },
  p: {
    marginBlock: '0.75rem',
  },
  strong: {
    fontWeight: font.weightMedium,
  },
  table: {
    borderCollapse: 'collapse',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    minWidth: '36rem',
  },
  // A table scrolls inside its own box, so a wide one never widens the page.
  tableScroll: {
    marginBlock: '1rem',
    maxWidth: '100%',
    overflowX: 'auto',
  },
});

const cls = (style: StyleXStyles) => props(style).className ?? '';

const renderer: RendererObject = {
  blockquote({ tokens }) {
    return `<blockquote class="${cls(prose.blockquote)}">${this.parser.parse(tokens)}</blockquote>\n`;
  },
  codespan({ text }) {
    return `<code class="${cls(prose.code)}">${escapeHtml(text)}</code>`;
  },
  heading({ depth, text, tokens }) {
    const style = depth === 2 ? prose.h2 : prose.h3;
    return `<h${depth} class="${cls(style)}" id="${slugify(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  },
  link({ href, tokens }) {
    const outbound = href.startsWith('http') ? ' rel="noreferrer" target="_blank"' : '';
    return `<a href="${escapeHtml(href)}"${outbound}><span class="${cls(prose.linkText)}">${this.parser.parseInline(tokens)}</span></a>`;
  },
  list(token) {
    const tag = token.ordered ? 'ol' : 'ul';
    const items = token.items
      .map((item) => `<li class="${cls(prose.li)}">${this.parser.parse(item.tokens)}</li>\n`)
      .join('');
    return `<${tag} class="${cls(prose.list)}">\n${items}</${tag}>\n`;
  },
  paragraph({ tokens }) {
    return `<p class="${cls(prose.p)}">${this.parser.parseInline(tokens)}</p>\n`;
  },
  strong({ tokens }) {
    return `<strong class="${cls(prose.strong)}">${this.parser.parseInline(tokens)}</strong>`;
  },
  table(token) {
    const cell = (tokens: Array<Token>, head: boolean) => {
      const tag = head ? 'th' : 'td';
      const style = cls([prose.cell, head && prose.head]);
      return `<${tag} class="${style}">${this.parser.parseInline(tokens)}</${tag}>`;
    };
    const head = token.header.map((c) => cell(c.tokens, true)).join('');
    const rows = token.rows
      .map((row) => `<tr>${row.map((c) => cell(c.tokens, false)).join('')}</tr>\n`)
      .join('');
    return `<div class="${cls(prose.tableScroll)}"><table class="${cls(prose.table)}"><thead><tr>${head}</tr></thead><tbody>\n${rows}</tbody></table></div>\n`;
  },
};

const markdown = new Marked({ gfm: true, renderer });

/** The blog's markdown: as the docs', but every link opens in the same tab. */
export const blogMarkdown = new Marked({
  gfm: true,
  renderer: {
    ...renderer,
    link({ href, tokens }) {
      return `<a href="${escapeHtml(href)}"><span class="${cls(prose.linkText)}">${this.parser.parseInline(tokens)}</span></a>`;
    },
  },
});

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Markdown inline text as plain text: link text without its address, no backticks or emphasis marks. */
export const plain = (text: string) =>
  text
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/[`*]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

/**
 * Splits the page at its code blocks, rendering the markdown between them to
 * html. The paragraphs under a `## faq` heading are its questions: each runs to
 * its first `?`, and the rest of the paragraph is the answer.
 */
export function render(
  body: string,
  md: Marked = markdown,
): {
  faq: Array<Faq>;
  headings: Array<Heading>;
  segments: Array<Segment>;
} {
  const tokens = md.lexer(body);
  const segments: Array<Segment> = [];
  const headings: Array<Heading> = [];
  const faq: Array<Faq> = [];
  let inFaq = false;
  let run: Array<Token> = [];
  const flush = () => {
    if (run.length > 0) {
      const list: TokensList = Object.assign(run, { links: tokens.links });
      segments.push({ html: md.parser(list), id: segments.length, kind: 'html' });
      run = [];
    }
  };
  for (const token of tokens) {
    if (token.type === 'code') {
      flush();
      segments.push({
        code: token.text,
        html: highlight(token.text, token.lang),
        id: segments.length,
        kind: 'code',
      });
      continue;
    }
    if (token.type === 'heading' && token.depth === 2) {
      headings.push({ id: slugify(token.text), text: token.text.replaceAll('`', '') });
      inFaq = slugify(token.text) === 'faq';
    }
    if (inFaq && token.type === 'paragraph') {
      const text = plain(token.text);
      const end = text.indexOf('?');
      const answer = text.slice(end + 1).trim();
      if (end > 0 && answer !== '') {
        faq.push({ answer, question: text.slice(0, end + 1) });
      }
    }
    run.push(token);
  }
  flush();
  return { faq, headings, segments };
}

function parse(slug: string, source: string): Page {
  const { body, description, metaTitle, order, title, updated } = docFrontmatter(slug, source);
  return { description, metaTitle, order, slug, title, updated, ...render(body) };
}

const files = import.meta.glob<string>('../../content/docs/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});

/** Every page, in sidebar order. */
export const pages: Array<Page> = Object.entries(files)
  .map(([path, source]) => parse(path.slice(path.lastIndexOf('/') + 1, -'.md'.length), source))
  .toSorted((a, b) => a.order - b.order);

const bySlug = new Map(pages.map((page) => [page.slug, page]));

export function findPage(slug: string): Page | undefined {
  return bySlug.get(slug);
}
