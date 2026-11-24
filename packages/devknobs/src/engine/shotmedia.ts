import { type MatchMedia, nativeMatchMedia } from "./matchmedia";
import { type MediaFeature, mentionsFeature, nativeMatchesGetter, rewriteMediaText, walkRules } from "./media";

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

/**
 * Whether the frame `view` applies a whole media query, as its own css does,
 * or null where there is nothing to ask. A picture matches a query against
 * its own size and as an image: as tall as the document, at one device px to
 * a css px, with no scripts. The frame's own `matchMedia` may be patched by
 * the knobs above it, as a touch screen, and that patch answers what the
 * page's scripts should read, not what the frame's css applies. So this
 * window's own `matchMedia`, `match`, is asked on the frame and read with its
 * own `matches`, `read`, both from before any patch. Where either is missing,
 * or the browser will not ask it on another window, the frame's `matchMedia`
 * is asked. Each query is asked once.
 */
export function frameDecides(
  view: Window,
  match: MatchMedia | null = nativeMatchMedia(),
  read: ((this: MediaQueryList) => boolean) | null = nativeMatchesGetter(),
): ((query: string) => boolean) | null {
  const own = typeof view.matchMedia === "function";
  if (!(match && read) && !own) return null;
  const ask = (query: string): boolean => {
    if (match && read) {
      try {
        return read.call(match.call(view, query));
      } catch {
        // Another browser may not ask its own on another window.
      }
    }
    return view.matchMedia(query).matches;
  };
  const decided = new Map<string, boolean>();
  return (query) => {
    let holds = decided.get(query);
    if (holds === undefined) {
      holds = ask(query);
      decided.set(query, holds);
    }
    return holds;
  };
}

/**
 * Is `text` a namespace rule with a prefix? Only those move to the top of
 * the copy's one sheet: a default one, with no prefix, would hold for every
 * sheet of the page there, not only its own, and an html element would stop
 * matching a plain type selector. A default one is left out of the copy.
 */
export function prefixedNamespace(text: string): boolean {
  return /^@namespace\s+(?!url\(|["'])\S/i.test(text);
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
 * page's prefixed `@namespace` rules go in front of each, so a namespaced selector
 * parses, and are left out of what is written. Without a way to parse them,
 * the rules stay as they are. With `decide`, the frame's answer to a whole
 * query, each query is made one that holds or one that does not by it, the
 * features of one it gives no answer to rewritten as without it.
 */
export function freezeMedia(
  rules: string[],
  read: [MediaFeature, string][],
  Sheet: typeof CSSStyleSheet | undefined,
  decide?: (query: string) => boolean,
): Frozen {
  const scheme = read.find(([feature]) => feature === "prefers-color-scheme")?.[1];
  const schemed = (text: string) => scheme !== undefined && text.includes("color-scheme");
  if (read.length === 0 && !decide) return { rules, computed: false };
  if (typeof Sheet?.prototype?.replaceSync !== "function") return { rules, computed: rules.some(schemed) };
  const namespaces = rules.filter(prefixedNamespace).join("\n");
  const queried = (text: string) => text.includes("@media") && (decide !== undefined || mentionsFeature(text));
  /** The query `text` made to read what the frame reads, feature by feature. */
  const rewritten = (text: string) => {
    let query = text;
    for (const [feature, value] of read) query = rewriteMediaText(query, feature, value);
    return query;
  };
  /** The query `text` as the frame decides it, or feature by feature where it will not. */
  const frameQuery = (text: string) => {
    if (!decide || text === "" || text === "all") return rewritten(text);
    try {
      return decide(text) ? "all" : "not all";
    } catch {
      return rewritten(text);
    }
  };
  let computed = false;
  const frozen = rules.map((text) => {
    if (!queried(text) && !schemed(text)) return text;
    try {
      const sheet = new Sheet();
      sheet.replaceSync(namespaces ? `${namespaces}\n${text}` : text);
      const parsed = Array.from(sheet.cssRules).filter((rule) => !rule.cssText.startsWith("@namespace"));
      if (parsed.length === 0) return text;
      walkRules(
        sheet.cssRules,
        (rule) => {
          const query = frameQuery(rule.media.mediaText);
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
