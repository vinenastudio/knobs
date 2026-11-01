export type Frontmatter = {
  body: string;
  description: string;
  /** The page's `<title>` and share title, 50 to 60 characters; only docs pages have one. */
  metaTitle: string | undefined;
  order: number;
  title: string;
  /** The day the page's content last changed, `YYYY-MM-DD`, for the sitemap and the page's schema. */
  updated: string | undefined;
};

/** The frontmatter keys a page has, read by hand: no yaml parser for four lines. */
export function frontmatter(slug: string, source: string): Frontmatter {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) {
    throw new Error(`docs: ${slug}.md has no frontmatter`);
  }
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
  }
  const title = fields.get('title');
  const description = fields.get('description');
  const order = Number(fields.get('order'));
  if (title === undefined || description === undefined || !Number.isFinite(order)) {
    throw new Error(`docs: ${slug}.md needs title, description and order`);
  }
  return {
    body: source.slice(match[0].length),
    description,
    metaTitle: fields.get('meta_title'),
    order,
    title,
    updated: fields.get('updated'),
  };
}

/**
 * A docs page's frontmatter: as above, `meta_title` is required, and `updated`
 * is required and a real day. The reference pages have no `updated`, so they use `frontmatter`.
 * `scripts/docs-check.ts` runs this on every page at build time, so a bad page
 * fails the build instead of the Worker.
 */
export function docFrontmatter(
  slug: string,
  source: string,
): Frontmatter & { metaTitle: string; updated: string } {
  const fields = frontmatter(slug, source);
  const { metaTitle, updated } = fields;
  if (metaTitle === undefined) {
    throw new Error(`docs: ${slug}.md needs meta_title`);
  }
  if (
    updated === undefined ||
    !/^\d{4}-\d{2}-\d{2}$/.test(updated) ||
    Number.isNaN(Date.parse(updated)) ||
    new Date(updated).toISOString().slice(0, 10) !== updated
  ) {
    throw new Error(`docs: ${slug}.md needs updated: YYYY-MM-DD, a real day`);
  }
  return { ...fields, metaTitle, updated };
}

/** The heading id rule the content's own links are written against. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(' ', '-')
    .replaceAll(/[^a-z0-9-]/g, '');
}
