import { type MediaFeature, mentionsFeature, rewriteMediaText, walkRules } from "./media";

/**
 * The media a copy of the page is drawn in. A picture of the copy is an svg
 * drawn as an image, and the browser matches the media queries of an image,
 * and `light-dark()` under `color-scheme: light dark`, against the system,
 * not against the frame. The frame may read another scheme, motion or
 * pointer than the system, from a knob or from the extension, while the
 * copy's rules are the page's own. So the copy's rules are made to read what
 * the frame reads, and its color schemes are pinned to the frame's.
 */

/** Each feature the frame may read otherwise than the system, and the values it may read. */
const VALUES: readonly (readonly [MediaFeature, readonly string[]])[] = [
  ["prefers-color-scheme", ["light", "dark"]],
  ["prefers-reduced-motion", ["reduce", "no-preference"]],
  ["prefers-contrast", ["more", "less", "custom", "no-preference"]],
  ["prefers-reduced-transparency", ["reduce", "no-preference"]],
  ["pointer", ["none", "coarse", "fine"]],
  ["any-pointer", ["none", "coarse", "fine"]],
  ["hover", ["none", "hover"]],
  ["any-hover", ["none", "hover"]],
];

/**
 * What `view` reads for each feature. One it reads no value of, as the
 * browser does not know it, or more than one of, as a device with a mouse
 * and a touch screen has two `any-pointer`s, is left out.
 */
export function frameMedia(view: Window): [MediaFeature, string][] {
  const read: [MediaFeature, string][] = [];
  for (const [feature, values] of VALUES) {
    try {
      const matched = values.filter((value) => view.matchMedia(`(${feature}: ${value})`).matches);
      if (matched.length === 1 && matched[0]) read.push([feature, matched[0]]);
    } catch {
      // A window that will not answer leaves the feature as the system has it.
    }
  }
  return read;
}

/** Does a `color-scheme` let the browser pick light or dark, by the system's? */
export function eitherScheme(value: string): boolean {
  return /\blight\b/.test(value) && /\bdark\b/.test(value);
}

/** `value`, a scheme that lets the browser pick, as `scheme` alone, its `only` kept. */
function fixed(value: string, scheme: string): string {
  return /\bonly\b/.test(value) ? `${scheme} only` : scheme;
}

/** Visit each declaration block in `rules`, those nested too. */
function eachStyle(rules: CSSRuleList, visit: (style: CSSStyleDeclaration) => void): void {
  for (const rule of Array.from(rules)) {
    const style = (rule as CSSStyleRule).style;
    if (style) visit(style);
    const children = (rule as CSSGroupingRule).cssRules;
    if (children && children !== rules) eachStyle(children, visit);
  }
}

/** The copy's rules, made to read what the frame reads. */
export interface Frozen {
  rules: string[];
  /**
   * A rule sets a scheme the rules alone do not tell, through a variable, or
   * one that could not be parsed, so each element that picks light or dark
   * by its computed scheme is pinned in the copy itself.
   */
  computed: boolean;
}

/**
 * The copy's rules, one by one, made to read `read`: each media query, and
 * each `color-scheme` that lets the browser pick light or dark set to the
 * frame's scheme, its priority kept. A rule that has either is parsed in a
 * sheet of its own, made by `Sheet`, rewritten, and written out again; the
 * rest stay as they are, so nothing else is lost. Each rule stands alone,
 * so their order, and the order of their layers, stays the page's. The
 * page's `@namespace` rules go in front of each, so a namespaced selector
 * parses, and are left out of what is written. Without a way to parse them,
 * the rules stay as they are.
 */
export function freezeMedia(
  rules: string[],
  read: [MediaFeature, string][],
  Sheet: typeof CSSStyleSheet | undefined,
): Frozen {
  const scheme = read.find(([feature]) => feature === "prefers-color-scheme")?.[1];
  const schemed = (text: string) => scheme !== undefined && text.includes("color-scheme");
  if (read.length === 0) return { rules, computed: false };
  if (typeof Sheet?.prototype?.replaceSync !== "function") return { rules, computed: rules.some(schemed) };
  const namespaces = rules.filter((text) => text.startsWith("@namespace")).join("\n");
  let computed = false;
  const frozen = rules.map((text) => {
    if (!(text.includes("@media") && mentionsFeature(text)) && !schemed(text)) return text;
    try {
      const sheet = new Sheet();
      sheet.replaceSync(namespaces ? `${namespaces}\n${text}` : text);
      const parsed = Array.from(sheet.cssRules).filter((rule) => !rule.cssText.startsWith("@namespace"));
      if (parsed.length === 0) return text;
      walkRules(
        sheet.cssRules,
        (rule) => {
          let query = rule.media.mediaText;
          for (const [feature, value] of read) query = rewriteMediaText(query, feature, value);
          if (query !== rule.media.mediaText) rule.media.mediaText = query;
        },
        new Set(),
      );
      if (scheme) {
        eachStyle(sheet.cssRules, (style) => {
          const value = style.getPropertyValue("color-scheme");
          if (value.includes("var(")) computed = true;
          else if (eitherScheme(value)) {
            style.setProperty("color-scheme", fixed(value, scheme), style.getPropertyPriority("color-scheme"));
          }
        });
      }
      return parsed.map((rule) => rule.cssText).join("\n");
    } catch {
      if (schemed(text)) computed = true;
      return text;
    }
  });
  return { rules: frozen, computed };
}

/**
 * What to pin each element of the page in `doc` to in its copy, where it
 * lets the browser pick light or dark, or null to leave it: the root, whose
 * scheme comes from its `color-scheme` meta too where its own is `normal`,
 * and each with a scheme in its inline style, which no rule rewritten
 * reaches. Every element, where `computed` says the rules leave some
 * unknown. Null where none would be pinned, so most pages cost one look at
 * the root.
 */
export function schemePins(
  doc: Document,
  view: Window,
  scheme: string,
  computed: boolean,
): ((node: Element) => string | null) | null {
  const root = doc.documentElement;
  const schemeOf = (node: Element) => view.getComputedStyle(node).getPropertyValue("color-scheme");
  let top = schemeOf(root);
  if (top === "normal" || top === "") {
    top = doc.querySelector('meta[name="color-scheme"]')?.getAttribute("content") ?? top;
  }
  const inline = new Set(doc.querySelectorAll('[style*="color-scheme"]'));
  if (!computed && inline.size === 0 && !eitherScheme(top)) return null;
  return (node) => {
    const value = node === root ? top : computed || inline.has(node) ? schemeOf(node) : "";
    return eitherScheme(value) ? fixed(value, scheme) : null;
  };
}

/** Pin `node` of a copy to `scheme`, over whatever the copy's rules say. */
export function pinScheme(node: Element, scheme: string): void {
  node.setAttribute("style", `${node.getAttribute("style") ?? ""};color-scheme:${scheme} !important`);
}
