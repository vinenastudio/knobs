/**
 * A use page's `terms`, the search terms it is written for: a comma separated
 * list in its frontmatter, at least one. The rest of its frontmatter is the
 * docs pages', read by `docFrontmatter`. `scripts/docs-check.ts` runs both.
 */
export function pageTerms(slug: string, source: string): Array<string> {
  const head = /^---\n([\s\S]*?)\n---\n/.exec(source)?.[1] ?? '';
  const terms = (/^terms:(.*)$/m.exec(head)?.[1] ?? '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) {
    throw new Error(`use: ${slug}.md needs terms`);
  }
  return terms;
}
