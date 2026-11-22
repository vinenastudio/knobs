import { composedParent } from "./hit";
import { collapse, descendantText, previewText } from "./preview";
import { isShadowRoot } from "./selector";

/**
 * Where an element sits on the page, for a grab that has no source to name
 * it: its text, the heading it is under and the landmark it is in.
 */

const HINT_MAX = 80;

const HEADINGS = "h1,h2,h3,h4,h5,h6,[role=heading]";

/** `compareDocumentPosition`: the other node comes before, or holds, this one. */
const PRECEDING = 2;

const LANDMARK_TAGS = new Set([
  "main",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "dialog",
  "search",
]);

/** Landmarks only when they have a name, as a `<section aria-label>` is a region. */
const NAMED_LANDMARK_TAGS = new Set(["section"]);

const LANDMARK_ROLES = new Set([
  "banner",
  "complementary",
  "contentinfo",
  "dialog",
  "form",
  "main",
  "navigation",
  "region",
  "search",
]);

function truncate(text: string): string {
  return text.length > HINT_MAX ? `${text.slice(0, HINT_MAX)}...` : text;
}

function textOf(element: Element): string {
  const parts: string[] = [];
  descendantText(element, parts, HINT_MAX + 1);
  return truncate(collapse(parts.join(" ")));
}

function tagOf(element: Element): string {
  return (element.tagName || "").toLowerCase();
}

/** The first heading with text inside a container. */
function headingInside(element: Element): string | null {
  if (element.children.length === 0) return null;
  for (const heading of Array.from(element.querySelectorAll(HEADINGS))) {
    const text = textOf(heading);
    if (text) return text;
  }
  return null;
}

/** The document or the shadow root the element is in, which its headings and ids are in too. */
function treeOf(element: Element): Document | ShadowRoot {
  const root = element.getRootNode();
  return isShadowRoot(root) ? root : element.ownerDocument;
}

/** The nearest heading with text before the element in its own tree, or around it. */
function headingInTree(element: Element): string | null {
  const headings = treeOf(element).querySelectorAll(HEADINGS);
  // Headings come in tree order, so those before the element are a run from the start.
  let low = 0;
  let high = headings.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const heading = headings[middle];
    if (heading && element.compareDocumentPosition(heading) & PRECEDING) low = middle + 1;
    else high = middle;
  }
  for (let index = low - 1; index >= 0; index -= 1) {
    const heading = headings[index];
    const text = heading ? textOf(heading) : "";
    if (text) return text;
  }
  return null;
}

/**
 * The nearest heading before the element: in its shadow root first, then
 * before the host of that root, out to the document.
 */
function headingBefore(element: Element): string | null {
  for (let at: Element | null = element; at; ) {
    const found = headingInTree(at);
    if (found) return found;
    const root = at.getRootNode();
    at = isShadowRoot(root) ? root.host : null;
  }
  return null;
}

/** The heading inside a container, else the nearest one before the element. */
function headingOf(element: Element): string | null {
  return headingInside(element) ?? headingBefore(element);
}

function accessibleName(element: Element): string {
  const label = collapse(element.getAttribute("aria-label") ?? "");
  if (label) return truncate(label);
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const named = ids
    .map((id) => treeOf(element).getElementById(id))
    .map((labelled) => (labelled ? textOf(labelled) : ""))
    .filter(Boolean);
  return truncate(named.join(" "));
}

/** `nav "Primary"`: the nearest landmark above the element, by its role or tag, and its name. */
function landmarkOf(element: Element): string | null {
  for (let at = composedParent(element); at; at = composedParent(at)) {
    const role = (at.getAttribute("role") ?? "").split(/\s+/)[0] ?? "";
    const tag = tagOf(at);
    const name = accessibleName(at);
    const kind = LANDMARK_ROLES.has(role)
      ? role
      : LANDMARK_TAGS.has(tag) || (NAMED_LANDMARK_TAGS.has(tag) && name)
        ? tag
        : null;
    if (kind) return name ? `${kind} ${JSON.stringify(name)}` : kind;
  }
  return null;
}

/** The hint lines, each `\n  name: value`, for the element's entry. */
export function pageHints(element: Element): string {
  const lines: string[] = [];
  if (!previewText(element, tagOf(element))) {
    const text = textOf(element);
    if (text) lines.push(`text: ${JSON.stringify(text)}`);
  }
  const heading = headingOf(element);
  if (heading) lines.push(`heading: ${JSON.stringify(heading)}`);
  const landmark = landmarkOf(element);
  if (landmark) lines.push(`landmark: ${landmark}`);
  return lines.map((line) => `\n  ${line}`).join("");
}
