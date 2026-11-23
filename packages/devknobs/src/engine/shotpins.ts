/**
 * What a copy of the page cannot work out for itself, set on each of its
 * elements as the page has it now. The copy is drawn as a picture, with no
 * script and no shadow roots, so two things come out otherwise than on the
 * page:
 *
 * - The browser runs the copy's css animations from their start, each time a
 *   picture is drawn, so one that has run on the page runs again under the
 *   bar. A transition, one a script runs and one that follows a scroll do not
 *   run in the copy at all, so what they move, fade or size is somewhere else.
 * - An element with a shadow root of its own shows nothing of it in the copy,
 *   so it lays out empty.
 */

/** The names in a keyframe that are no property. */
const NOT_PROPERTY = new Set(["offset", "computedOffset", "easing", "composite"]);

/** A delay that puts an animation the page has no more past its end in the copy, in ms. */
export const LONG_DONE = -1e9;

/** What runs on an element of the page now. */
export interface Moving {
  /** The properties set by what the copy cannot run, to pin as they are now. */
  pinned: Set<string>;
  /** Each css animation by its name, and the delay that starts it in the copy where it is on the page now, in ms. */
  phases: Map<string, number>;
}

/** A property as `getKeyframes` names it, as css names it: `backgroundColor` as `background-color`. */
export function cssName(name: string): string {
  if (name.startsWith("--")) return name;
  if (name === "cssFloat") return "float";
  if (name === "cssOffset") return "offset";
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Does `effect` run through keyframes, as every animation of a page does? */
function keyframed(effect: AnimationEffect | null): effect is KeyframeEffect {
  return effect !== null && "getKeyframes" in effect && "target" in effect;
}

/** Is `animation` one a css `animation` runs? */
function fromCss(animation: Animation): animation is CSSAnimation {
  return "animationName" in animation && typeof animation.animationName === "string";
}

/**
 * The elements of `doc` something runs on now, and what: a css animation on
 * the document's own clock by the delay that starts it in the copy where it
 * is, the rest by the properties it sets. One on a pseudo-element is left out.
 */
export function animated(doc: Document): Map<Element, Moving> {
  const found = new Map<Element, Moving>();
  let running: Animation[] = [];
  try {
    running = typeof doc.getAnimations === "function" ? doc.getAnimations() : [];
  } catch {
    return found;
  }
  for (const animation of running) {
    const effect = animation.effect;
    if (!keyframed(effect) || !effect.target || effect.pseudoElement) continue;
    const moving = found.get(effect.target) ?? { pinned: new Set<string>(), phases: new Map<string, number>() };
    found.set(effect.target, moving);
    const time = animation.currentTime;
    if (fromCss(animation) && typeof time === "number") {
      moving.phases.set(animation.animationName, (Number(effect.getTiming().delay) || 0) - time);
      continue;
    }
    for (const frame of effect.getKeyframes()) {
      for (const key of Object.keys(frame)) if (!NOT_PROPERTY.has(key)) moving.pinned.add(cssName(key));
    }
  }
  return found;
}

/** Each of `names` as `style` has it now, as css to pin it with. */
export function animationPins(style: CSSStyleDeclaration, names: Iterable<string>): string {
  let css = "";
  for (const name of names) {
    const value = style.getPropertyValue(name);
    if (value !== "") css += `;${name}:${value} !important`;
  }
  return css;
}

/**
 * The delay of each css animation `style` names, as css, so the copy runs it
 * from where the page has it by `phases`, and one the page has no more, as it
 * has run, past its end. None where it names no animation.
 */
export function phasePins(style: CSSStyleDeclaration, phases: Map<string, number> | undefined): string {
  const names = style.animationName;
  if (!names || names === "none") return "";
  const delays = names.split(",").map((name) => `${phases?.get(name.trim()) ?? LONG_DONE}ms`);
  return `;animation-delay:${delays.join(", ")} !important`;
}

/**
 * The box of an element with a shadow root, as `style` has it, as css to pin
 * it with: its display, which its shadow's own rules may set, its size, and
 * the font its line is laid out by. One laid out inline, or with no box, is
 * left as it is.
 */
export function hostPins(style: CSSStyleDeclaration): string {
  const { display, width, height, fontSize, lineHeight } = style;
  if (!display || display === "inline" || display === "contents" || display === "none" || !width || !height) return "";
  const font = fontSize && lineHeight ? `;font-size:${fontSize} !important;line-height:${lineHeight} !important` : "";
  return `;display:${display} !important;width:${width} !important;height:${height} !important${font}`;
}

/**
 * A shadow host that sits in a line by its shadow's text, which the copy does
 * not have, as css to sit it there without: where it fills its parent's line
 * from top to bottom, at the line's top. Otherwise nothing.
 */
export function lineTop(node: Element, style: CSSStyleDeclaration): string {
  const parent = node.parentElement;
  if (!style.display?.startsWith("inline-") || !parent) return "";
  const own = node.getBoundingClientRect();
  const line = parent.getBoundingClientRect();
  return Math.abs(own.top - line.top) < 0.5 && Math.abs(own.height - line.height) < 0.5 ? ";vertical-align:top !important" : "";
}

/**
 * What to add to the style of the copy of each element of the page in `doc`,
 * seen in `view`, so it is laid out and drawn as on the page now, or null to
 * leave it. Only an element something runs on now, or a shadow host, has its
 * style read: every other animation the copy has is past its end there, by
 * its own rules, as the page has none running.
 */
export function stillPins(doc: Document, view: Window): (node: Element) => string | null {
  const moving = animated(doc);
  return (node) => {
    if (!node.shadowRoot && !moving.has(node)) return null;
    const style = view.getComputedStyle(node);
    const now = moving.get(node);
    let css = phasePins(style, now?.phases);
    if (now && now.pinned.size > 0) css += animationPins(style, now.pinned);
    if (node.shadowRoot) css += hostPins(style) + lineTop(node, style);
    return css === "" ? null : css;
  };
}
