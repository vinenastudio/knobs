/**
 * What in an edit could run a script on the page: an element that runs or
 * loads one (`<script>`, a frame, an `<object>`, a `<base>`), an `on…`
 * handler, a `srcdoc`, or a `javascript:` address, and any attribute or text
 * of the page's own such elements, which could turn a data script into one
 * that runs, or move where a `<base>` sends addresses. Kept edits and edits an
 * agent hands in are made only where none of it is, so a list a page script
 * planted cannot run anything as it is made again. To use it:
 *
 *   if (riskyNodes(parseHtml(doc, html))) refuse();    // the parsed markup, exact
 *   if (riskyEdit(edit)) refuse();                     // the text alone, where nothing parses it
 */

/** Why an edit that could run a script is not made. */
export const RISK = "could run a script";

/** Elements that run a script, load another document, or change where the page's addresses go. */
const TAGS = new Set(["script", "iframe", "frame", "object", "embed", "base", "meta", "link"]);

/** Attributes whose value is an address, which a `javascript:` one turns into a script, svg's animation values among them. */
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "xlink:href", "values", "to", "from", "by"]);

/** Svg animation attributes that hold a list of values, `;` between them, each of which the animation sets. */
const LISTS = new Set(["values"]);

/** Whether a value is a `javascript:` address, as the browser reads it: case, white space and control characters aside. */
export function scriptUrl(value: string): boolean {
  return value.replace(/[\u0000- \u007f]/g, "").toLowerCase().startsWith("javascript:");
}

/** Whether an attribute could run a script: an `on…` handler, `srcdoc`, or a `javascript:` address in an address, any item of a `values` list too. */
export function riskyAttribute(name: string, value: string | null): boolean {
  const lower = name.trim().toLowerCase();
  if (lower.startsWith("on") || lower === "srcdoc") return true;
  if (value === null || !URL_ATTRIBUTES.has(lower)) return false;
  return (LISTS.has(lower) ? value.split(";") : [value]).some(scriptUrl);
}

/** Whether an element runs or loads a script, another document or the page's addresses, in any namespace, as svg's `<script>`: no edit of its attributes or text is made. */
export function riskyElement(element: Element): boolean {
  return TAGS.has(element.localName.toLowerCase());
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/** Whether parsed nodes hold anything that could run a script, in them or anywhere in what they hold. */
export function riskyNodes(nodes: readonly Node[]): boolean {
  for (const node of nodes) {
    if (!isElement(node)) continue;
    for (const one of [node, ...Array.from(node.querySelectorAll("*"))]) {
      if (riskyElement(one)) return true;
      if (Array.from(one.attributes).some((attr) => riskyAttribute(attr.name, attr.value))) return true;
    }
  }
  return false;
}

/**
 * Whether an edit could run a script, from its text alone, for where no
 * parser is, as the extension's service worker. It errs to refuse: markup
 * that names such an element, has an `on…=` or a `srcdoc`, a `javascript:`
 * anywhere, or a character reference, which could spell one out.
 */
export function riskyEdit(edit: { kind: string; property: string; after: string | null }): boolean {
  if (edit.kind === "attr") return riskyAttribute(edit.property, edit.after);
  if (edit.kind !== "html" || edit.after === null) return false;
  const markup = edit.after;
  return (
    /<\s*(script|iframe|frame|object|embed|base|meta|link)\b/i.test(markup) ||
    /[\s"'/]on[a-z]+\s*=/i.test(markup) ||
    /srcdoc/i.test(markup) ||
    /javascript\s*:/i.test(markup.replace(/[\u0000- \u007f]/g, "")) ||
    /&#|&colon;|&tab;|&newline;/i.test(markup)
  );
}
