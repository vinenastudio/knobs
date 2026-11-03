/** A parsed HTML element. Text nodes are plain strings. */
export interface HtmlElement {
  attrs: Record<string, string>;
  children: Array<HtmlNode>;
  tag: string;
}

export type HtmlNode = HtmlElement | string;

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'template']);

const ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '©',
  gt: '>',
  hellip: '…',
  laquo: '«',
  larr: '←',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: String.fromCodePoint(0x20_14),
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  raquo: '»',
  rarr: '→',
  rdquo: '”',
  reg: '®',
  rsquo: '’',
  times: '×',
  trade: '™',
};

export function decodeEntities(text: string): string {
  return text.replaceAll(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name.startsWith('#')) {
      const code =
        name[1] === 'x' || name[1] === 'X'
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10_ff_ff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+)))?/g;

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1]?.toLowerCase();
    if (name) {
      attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
    }
  }
  return attrs;
}

/** Where the tag that opens at `start` ends, skipping a `>` inside a quoted value. */
function tagEnd(html: string, start: number): number {
  let quote = '';
  for (let index = start; index < html.length; index++) {
    const char = html[index];
    if (quote) {
      if (char === quote) {
        quote = '';
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }
  return -1;
}

/**
 * A small, forgiving HTML parser for server-rendered pages. It runs the same on
 * Workers and in Node, which have no common DOM. A closing tag pops back to its
 * open element and is ignored when none is open.
 */
export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = { attrs: {}, children: [], tag: '#root' };
  const stack: Array<HtmlElement> = [root];
  const current = () => stack.at(-1) ?? root;
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf('<', index);
    if (open === -1) {
      current().children.push(decodeEntities(html.slice(index)));
      break;
    }
    if (open > index) {
      current().children.push(decodeEntities(html.slice(index, open)));
    }
    if (html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4);
      index = close === -1 ? html.length : close + 3;
      continue;
    }
    const end = tagEnd(html, open + 1);
    if (end === -1) {
      current().children.push(decodeEntities(html.slice(open)));
      break;
    }
    const inner = html.slice(open + 1, end);
    index = end + 1;
    if (inner.startsWith('!') || inner.startsWith('?')) {
      continue;
    }
    if (inner.startsWith('/')) {
      const tag = inner.slice(1).trim().toLowerCase();
      const at = stack.findLastIndex((element) => element.tag === tag);
      if (at > 0) {
        stack.length = at;
      }
      continue;
    }
    const name = /^[^\s/>]+/.exec(inner)?.[0];
    if (!name) {
      current().children.push(`<${decodeEntities(inner)}>`);
      continue;
    }
    const tag = name.toLowerCase();
    const element: HtmlElement = {
      attrs: parseAttributes(inner.slice(name.length)),
      children: [],
      tag,
    };
    current().children.push(element);
    if (RAW_TEXT_TAGS.has(tag)) {
      const closer = new RegExp(String.raw`</${tag}\b`, 'gi');
      closer.lastIndex = index;
      const close = closer.exec(html)?.index ?? -1;
      const text = html.slice(index, close === -1 ? html.length : close);
      element.children.push(tag === 'title' || tag === 'textarea' ? decodeEntities(text) : text);
      const closeEnd = close === -1 ? -1 : html.indexOf('>', close);
      index = closeEnd === -1 ? html.length : closeEnd + 1;
    } else if (!VOID_TAGS.has(tag) && !inner.endsWith('/')) {
      stack.push(element);
    }
  }
  return root;
}

export function findElement(
  node: HtmlElement,
  test: (element: HtmlElement) => boolean,
): HtmlElement | undefined {
  for (const child of node.children) {
    if (typeof child !== 'string') {
      if (test(child)) {
        return child;
      }
      const found = findElement(child, test);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

export function textContent(node: HtmlNode): string {
  return typeof node === 'string' ? node : node.children.map(textContent).join('');
}

const SKIP_TAGS = new Set([
  'audio',
  'button',
  'canvas',
  'dialog',
  'form',
  'iframe',
  'img',
  'input',
  'link',
  'meta',
  'nav',
  'noscript',
  'object',
  'picture',
  'script',
  'select',
  'style',
  'svg',
  'template',
  'textarea',
  'video',
]);

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

interface Context {
  base: URL;
  /** Added to every heading level, so a page's h1 can sit under a heading of its own. */
  headingOffset: number;
  /** Inside a section of content a header or footer is that section's own, so it stays. */
  inContent: boolean;
  /** A button inside a heading is a disclosure's question, as the faq block renders it, so its text stays. */
  inHeading: boolean;
}

const CONTENT_TAGS = new Set(['article', 'aside', 'main', 'section']);

const PAGE_CHROME_ROLES = new Set(['banner', 'contentinfo', 'navigation']);

function isHidden(element: HtmlElement, context: Context): boolean {
  if (element.attrs['data-llms'] === 'skip' || PAGE_CHROME_ROLES.has(element.attrs['role'] ?? '')) {
    return true;
  }
  if (element.tag === 'button' && context.inHeading) {
    return false;
  }
  if (SKIP_TAGS.has(element.tag)) {
    return true;
  }
  if ((element.tag === 'header' || element.tag === 'footer') && !context.inContent) {
    return true;
  }
  return 'hidden' in element.attrs || element.attrs['aria-hidden'] === 'true';
}

function isBlock(node: HtmlNode): node is HtmlElement {
  return (
    typeof node !== 'string' && (BLOCK_TAGS.has(node.tag) || node.attrs['data-llms'] === 'pre')
  );
}

/**
 * The text a reader gets, without hidden or aria-hidden parts. In a `kbd` each part is
 * its own word: a key's glyph and its spoken name sit side by side with no space, and
 * which one is the screen reader text cannot be told from a hashed class name.
 */
function visibleText(node: HtmlNode, context: Context): string {
  if (typeof node === 'string') {
    return node;
  }
  if (isHidden(node, context)) {
    return '';
  }
  const parts = node.children.map((child) => visibleText(child, context));
  return node.tag === 'kbd'
    ? parts
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ')
    : parts.join('');
}

function absolute(href: string, base: URL): string | undefined {
  if (/^\s*(javascript|data):/i.test(href)) {
    return undefined;
  }
  try {
    return new URL(href, base).href;
  } catch {
    return undefined;
  }
}

function wrap(marker: string, text: string): string {
  const trimmed = text.trim();
  return trimmed ? `${marker}${trimmed}${marker}` : '';
}

/** Text-level tags that may touch a neighbor with no space, as in `<b>a</b><i>b</i>`. */
const PHRASING_TAGS = new Set([
  'abbr',
  'b',
  'code',
  'em',
  'i',
  'kbd',
  'mark',
  's',
  'samp',
  'strong',
  'sub',
  'sup',
  'u',
]);

/** The markdown marker of an emphasis tag, so two of the same kind side by side merge. */
function emphasis(tag: string): string | undefined {
  if (tag === 'strong' || tag === 'b') {
    return '**';
  }
  return tag === 'em' || tag === 'i' ? '*' : undefined;
}

function inlineElement(node: HtmlElement, context: Context): string {
  switch (node.tag) {
    case 'br':
      return '\n';
    case 'a': {
      const text = inline(node.children, context).replaceAll(/\s+/g, ' ').trim();
      const href = node.attrs['href'];
      const url = href === undefined ? undefined : absolute(href, context.base);
      return text && url ? `[${text.replaceAll(/([[\]])/g, String.raw`\$1`)}](${url})` : text;
    }
    case 'code':
    case 'kbd':
    case 'samp': {
      const code = visibleText(node, context).replaceAll(/\s+/g, ' ').trim();
      if (!code) {
        return '';
      }
      const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
      const fence = '`'.repeat(longest + 1);
      const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : '';
      return `${fence}${pad}${code}${pad}${fence}`;
    }
    case 'strong':
    case 'b':
      return wrap('**', inline(node.children, context));
    case 'em':
    case 'i':
      return wrap('*', inline(node.children, context));
    default:
      return BLOCK_TAGS.has(node.tag)
        ? ` ${inline(node.children, context)} `
        : inline(node.children, context);
  }
}

function inline(nodes: ReadonlyArray<HtmlNode>, context: Context): string {
  let out = '';
  let previous: HtmlElement | undefined;
  for (const node of nodes) {
    if (typeof node === 'string') {
      out += node.replaceAll(/\s+/g, ' ');
      previous = undefined;
      continue;
    }
    if (isHidden(node, context)) {
      continue;
    }
    const piece = inlineElement(node, context);
    const marker = emphasis(node.tag);
    if (previous && piece && marker && emphasis(previous.tag) === marker && out.endsWith(marker)) {
      // `<b>a</b><b>b</b>` is one bold run, not `**a****b**`.
      out = out.slice(0, -marker.length) + piece.slice(marker.length);
      previous = node;
      continue;
    }
    // Two elements side by side, such as a card link's title and description spans, are
    // separate words even when the HTML puts no space between them. Text-level tags on
    // both sides may touch, and so may an opening sign before or a closing one after.
    if (
      previous &&
      !(PHRASING_TAGS.has(previous.tag) && PHRASING_TAGS.has(node.tag)) &&
      /\S$/.test(out) &&
      !/[([$€£“‘]$/.test(out) &&
      /^[^\s.,;:!?)\]%”’…]/.test(piece)
    ) {
      out += ' ';
    }
    out += piece;
    if (piece) {
      previous = node;
    }
  }
  return out;
}

function paragraph(nodes: ReadonlyArray<HtmlNode>, context: Context): string {
  return inline(nodes, context)
    .split('\n')
    .map((line) => line.replaceAll(/ {2,}/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : line))
    .join('\n');
}

function list(element: HtmlElement, context: Context): string {
  const ordered = element.tag === 'ol';
  const start = Number.parseInt(element.attrs['start'] ?? '1', 10) || 1;
  const items: Array<string> = [];
  for (const child of element.children) {
    if (typeof child === 'string' || child.tag !== 'li' || isHidden(child, context)) {
      continue;
    }
    const marker = ordered ? `${start + items.length}. ` : '- ';
    const body = blocks(child.children, context).join('\n');
    if (body) {
      const [first = '', ...rest] = body.split('\n');
      const pad = ' '.repeat(marker.length);
      items.push(
        [`${marker}${first}`, ...rest.map((line) => (line ? `${pad}${line}` : line))].join('\n'),
      );
    }
  }
  return items.join('\n');
}

function codeBlock(element: HtmlElement, context: Context): string {
  const code = visibleText(element, context).replace(/^\n/, '').trimEnd();
  if (!code) {
    return '';
  }
  const inner = findElement(element, (child) => child.tag === 'code');
  const language =
    /(?:^|\s)(?:language|lang)-([\w+-]+)/.exec(
      inner?.attrs['class'] ?? element.attrs['class'] ?? '',
    )?.[1] ?? '';
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${language}\n${code}\n${fence}`;
}

function cells(row: HtmlElement, context: Context): Array<string> {
  return row.children
    .filter(
      (cell): cell is HtmlElement =>
        typeof cell !== 'string' && (cell.tag === 'td' || cell.tag === 'th'),
    )
    .map((cell) =>
      paragraph(cell.children, context)
        .replaceAll('\n', ' ')
        .replaceAll('|', String.raw`\|`),
    );
}

function table(element: HtmlElement, context: Context): string {
  const rows: Array<HtmlElement> = [];
  const collect = (node: HtmlElement) => {
    for (const child of node.children) {
      if (typeof child !== 'string') {
        if (child.tag === 'tr') {
          rows.push(child);
        } else if (child.tag === 'thead' || child.tag === 'tbody' || child.tag === 'tfoot') {
          collect(child);
        }
      }
    }
  };
  collect(element);
  const lines = rows.map((row) => cells(row, context)).filter((row) => row.length > 0);
  const [head, ...body] = lines;
  if (!head) {
    return '';
  }
  const width = Math.max(...lines.map((row) => row.length));
  const line = (row: Array<string>) =>
    `| ${Array.from({ length: width }, (_, at) => row[at] ?? '').join(' | ')} |`;
  return [
    line(head),
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map(line),
  ].join('\n');
}

function block(element: HtmlElement, context: Context): Array<string> {
  const tag = element.tag;
  const heading = /^h([1-6])$/.exec(tag)?.[1];
  if (heading) {
    const text = paragraph(element.children, { ...context, inHeading: true }).replaceAll('\n', ' ');
    const level = Math.min(6, Number(heading) + context.headingOffset);
    return text ? [`${'#'.repeat(level)} ${text}`] : [];
  }
  // Text whose line breaks matter, such as a prompt to paste: kept as it is, in a fence.
  if (element.attrs['data-llms'] === 'pre') {
    const text = codeBlock(element, context);
    return text ? [text] : [];
  }
  switch (tag) {
    case 'p':
    case 'dt':
    case 'summary':
    case 'td':
    case 'th': {
      const text = paragraph(element.children, context);
      return text ? [tag === 'dt' || tag === 'summary' ? wrap('**', text) : text] : [];
    }
    case 'ul':
    case 'ol': {
      const text = list(element, context);
      return text ? [text] : [];
    }
    case 'pre': {
      const text = codeBlock(element, context);
      return text ? [text] : [];
    }
    case 'blockquote': {
      const text = blocks(element.children, context).join('\n\n');
      return text ? [indent(text, '> ').replaceAll(/^$/gm, '>')] : [];
    }
    case 'table': {
      const text = table(element, context);
      return text ? [text] : [];
    }
    case 'hr':
      return ['---'];
    default:
      return blocks(
        element.children,
        CONTENT_TAGS.has(tag) ? { ...context, inContent: true } : context,
      );
  }
}

function blocks(nodes: ReadonlyArray<HtmlNode>, context: Context): Array<string> {
  const out: Array<string> = [];
  let run: Array<HtmlNode> = [];
  const flush = () => {
    const text = paragraph(run, context);
    if (text) {
      out.push(text);
    }
    run = [];
  };
  for (const node of nodes) {
    if (typeof node !== 'string' && isHidden(node, context)) {
      continue;
    }
    if (isBlock(node)) {
      flush();
      out.push(...block(node, context));
    } else {
      run.push(node);
    }
  }
  flush();
  return out;
}

export interface MarkdownOptions {
  /** The page's URL: relative links resolve against it. */
  base: URL | string;
  /** Added to every heading level, capped at 6. */
  headingOffset?: number;
}

/** Markdown for the content of an element: headings, paragraphs, absolute links, lists, code, tables, and FAQ `details` as question and answer. */
export function toMarkdown(node: HtmlElement, options: MarkdownOptions): string {
  const context: Context = {
    base: new URL(options.base),
    headingOffset: options.headingOffset ?? 0,
    inContent: false,
    inHeading: false,
  };
  return block(node, context).join('\n\n');
}
