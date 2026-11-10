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

/**
 * Each of `rules`, the copy's rules one by one, with its media queries
 * reading `read`. A rule that has a query on one of the features is parsed
 * in a sheet of its own, made by `Sheet`, its queries rewritten, and written
 * out again; the rest stay as they are, so nothing else is lost. Each rule
 * stands alone, so their order, and the order of their layers, stays the
 * page's. Without a way to parse them, the rules stay as they are.
 */
export function freezeMedia(
  rules: string[],
  read: [MediaFeature, string][],
  Sheet: typeof CSSStyleSheet | undefined,
): string[] {
  if (read.length === 0 || typeof Sheet?.prototype?.replaceSync !== "function") return rules;
  return rules.map((text) => {
    if (!text.includes("@media") || !mentionsFeature(text)) return text;
    try {
      const sheet = new Sheet();
      sheet.replaceSync(text);
      if (sheet.cssRules.length === 0) return text;
      walkRules(
        sheet.cssRules,
        (rule) => {
          let media = rule.media.mediaText;
          for (const [feature, value] of read) media = rewriteMediaText(media, feature, value);
          if (media !== rule.media.mediaText) rule.media.mediaText = media;
        },
        new Set(),
      );
      return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
    } catch {
      return text;
    }
  });
}

/** Does a computed `color-scheme` let the browser pick light or dark, by the system's? */
export function eitherScheme(value: string): boolean {
  return /\blight\b/.test(value) && /\bdark\b/.test(value);
}

/**
 * A way to tell which elements of the page in `doc` to pin to the frame's
 * scheme in its copy: each that lets the browser pick light or dark. One
 * that only takes its parent's is pinned too, as its own rule may set it
 * again in the copy, over the pin it would take. The root's comes from its
 * `color-scheme` meta too, which counts where its own is `normal`. Where
 * none of the page's rules or inline styles set a scheme, only the root is
 * looked at: the rest take its pin. Null where the root picks none then, so
 * most pages cost one look at the root.
 */
export function schemePins(doc: Document, view: Window, rules: string): ((node: Element) => boolean) | null {
  const root = doc.documentElement;
  const schemeOf = (node: Element) => view.getComputedStyle(node).getPropertyValue("color-scheme");
  let top = schemeOf(root);
  if (top === "normal" || top === "") {
    top = doc.querySelector('meta[name="color-scheme"]')?.getAttribute("content") ?? top;
  }
  const set = rules.includes("color-scheme") || doc.querySelector('[style*="color-scheme"]') !== null;
  if (!set && !eitherScheme(top)) return null;
  return (node) => (node === root ? eitherScheme(top) : set && eitherScheme(schemeOf(node)));
}

/** Pin `node` of a copy to `scheme`, over whatever the copy's rules say. */
export function pinScheme(node: Element, scheme: string): void {
  node.setAttribute("style", `${node.getAttribute("style") ?? ""};color-scheme:${scheme} !important`);
}
