/**
 * The suggestions of the styles view's fields, as the browsers' tools have
 * them: under a property's name, every property the browser knows and the
 * custom properties the page sets; under a value, the keywords the browser
 * takes for that property, named colors where it takes a color, `var()` of
 * each custom property, and the global keywords. What the browser knows is
 * asked of it, never listed here: the names come from a style's own keys,
 * and a keyword shows only where `CSS.supports` takes it. The list opens as
 * the field is typed in, filtered by what was typed, its start first:
 *
 *   ↑ ↓      mark one in the list     ↩       take the one marked, then the field goes on
 *   Tab      take the one marked, or the first, then the field goes on
 *   esc      close the list           click   take it, the field stays open
 *
 * None is marked as the list opens, so ↩ on what was typed puts that on.
 *
 * To use it:
 *
 *   const auto = autocomplete(input, () => valueSuggestions("display", browserCss(element)), "value");
 *   if (auto.key(event)) return; auto.close();
 */

import { el } from "./dom";

/** The keywords every property takes. */
export const GLOBAL_KEYWORDS = ["inherit", "initial", "unset", "revert", "revert-layer"];

/** Keywords that properties take, each shown only where the browser takes it for the property. */
export const KEYWORDS = (
  "auto none normal 0 100% block inline inline-block flex inline-flex grid inline-grid contents flow-root table " +
  "table-row table-cell list-item static relative absolute fixed sticky visible hidden clip scroll row row-reverse " +
  "column column-reverse wrap nowrap wrap-reverse start end center flex-start flex-end self-start self-end left right " +
  "top bottom middle space-between space-around space-evenly stretch baseline justify uppercase lowercase capitalize " +
  "underline overline line-through italic oblique bold bolder lighter pre pre-wrap pre-line break-spaces break-all " +
  "keep-all break-word anywhere pointer default text move grab grabbing not-allowed wait help crosshair solid dashed " +
  "dotted double groove ridge inset outset border-box content-box padding-box cover contain fill scale-down repeat " +
  "no-repeat repeat-x repeat-y round ease ease-in ease-out ease-in-out linear step-start step-end infinite alternate " +
  "reverse forwards backwards both running paused fit-content min-content max-content sub super text-top text-bottom " +
  "collapse separate ltr rtl horizontal-tb vertical-rl vertical-lr isolate multiply screen overlay darken lighten " +
  "difference exclusion disc circle square decimal outside inside ellipsis dense smooth thin medium thick small large " +
  "x-small x-large smaller larger light dark all manual"
).split(" ");

/** Words for properties that take a name of the page's own, where the browser takes any word. */
export const NAMED_KEYWORDS: Record<string, string[]> = {
  "font-family": ["system-ui", "sans-serif", "serif", "monospace", "ui-monospace", "ui-sans-serif", "ui-serif", "cursive", "fantasy"],
  "transition-property": ["all", "none", "opacity", "transform", "color", "background-color"],
  "will-change": ["auto", "transform", "opacity", "scroll-position", "contents"],
  "animation-name": ["none"],
  "grid-area": ["auto"],
  "grid-template-areas": ["none"],
  "counter-reset": ["none"],
  "counter-increment": ["none"],
  "view-transition-name": ["none"],
  "container-name": ["none"],
  "list-style-type": ["none", "disc", "circle", "square", "decimal"],
};

/** The colors css names, for a property that takes a color. */
export const NAMED_COLORS = (
  "currentcolor transparent aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
  "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue " +
  "darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid " +
  "darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink " +
  "deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold " +
  "goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush " +
  "lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey " +
  "lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime " +
  "limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
  "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin " +
  "navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise " +
  "palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue " +
  "saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow " +
  "springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
).split(" ");

/** The most suggestions a list shows. */
export const MOST = 50;

/** What the suggestions are drawn from: the browser's word on a value, the properties it knows, the page's custom properties. */
export interface CssWorld {
  supports(property: string, value: string): boolean;
  /** Every property the browser knows, as css writes it. */
  properties(): string[];
  /** The custom properties the page sets, as `--name`. */
  customs(): string[];
}

/** A key of a style object as css writes it: `backgroundColor` as `background-color`, `webkitMask` as `-webkit-mask`. */
export function cssName(key: string): string {
  if (key.includes("-")) return key;
  const dashed = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return /^(webkit|moz|ms)-/.test(dashed) ? `-${dashed}` : dashed;
}

/**
 * The properties a style object names: its keys and the longhands it lists,
 * those the browser takes, the prefixed ones last. Method names and the
 * like are not properties, and the browser refuses them.
 */
export function propertyNames(style: object, supports: CssWorld["supports"]): string[] {
  const found = new Set<string>();
  // Its keys, own and inherited: a for-in walks them all.
  for (const key in style) if (!/^\d/.test(key)) found.add(cssName(key));
  const listed: unknown = Reflect.get(style, "length");
  for (let at = 0; typeof listed === "number" && at < listed; at++) {
    const name: unknown = Reflect.get(style, at);
    if (typeof name === "string" && !name.startsWith("--")) found.add(name);
  }
  const names = [...found].filter((name) => !name.startsWith("--") && supports(name, "inherit"));
  const plain = names.filter((name) => !name.startsWith("-")).sort();
  return [...plain, ...names.filter((name) => name.startsWith("-")).sort()];
}

/** A rule that holds declarations, or rules of its own. */
interface RuleLike {
  style?: { length: number; [at: number]: string };
  cssRules?: ArrayLike<RuleLike>;
}

/** The most rules a walk for custom properties reads, so a huge stylesheet does not hold the field up. */
const RULES_READ = 5000;

/** The custom properties that rules set, read from the sheets the page may read, in the order found. */
export function customsIn(sheets: ArrayLike<{ cssRules?: ArrayLike<RuleLike> }>, more: readonly string[] = []): string[] {
  const found = new Set<string>(more.filter((name) => name.startsWith("--")));
  let read = 0;
  const walk = (rules: ArrayLike<RuleLike> | undefined): void => {
    for (let at = 0; rules && at < rules.length && read < RULES_READ; at++) {
      const rule = rules[at];
      read++;
      const style = rule?.style;
      for (let one = 0; style && one < style.length; one++) {
        const name = style[one];
        if (name?.startsWith("--")) found.add(name);
      }
      walk(rule?.cssRules);
    }
  };
  for (let at = 0; at < sheets.length; at++) {
    try {
      walk(sheets[at]?.cssRules);
    } catch {
      // A sheet from another origin: the browser does not let the page read it.
    }
  }
  return [...found];
}

/** What an element's window knows of css, asked as the field opens, or nothing where it cannot be asked. */
export function browserCss(element: Element): CssWorld {
  const view = element.ownerDocument?.defaultView ?? null;
  const css = view?.CSS ?? null;
  const supports = (property: string, value: string): boolean => {
    try {
      return css !== null && css.supports(property, value);
    } catch {
      return false;
    }
  };
  /** Read once for each field. */
  let customs: string[] | null = null;
  return {
    supports,
    properties() {
      try {
        const doc = element.ownerDocument;
        const cached = KNOWN.get(doc);
        if (cached) return cached;
        const names = view ? propertyNames(view.getComputedStyle(doc.documentElement), supports) : [];
        KNOWN.set(doc, names);
        return names;
      } catch {
        return [];
      }
    },
    customs() {
      if (customs) return customs;
      try {
        const computed = view?.getComputedStyle(element);
        const seen: string[] = [];
        for (let at = 0; computed && at < computed.length; at++) seen.push(computed[at] ?? "");
        customs = customsIn(element.ownerDocument.styleSheets as unknown as ArrayLike<{ cssRules?: ArrayLike<RuleLike> }>, seen);
      } catch {
        customs = [];
      }
      return customs;
    },
  };
}

/** The properties each document's browser knows, read once. */
const KNOWN = new WeakMap<Document, string[]>();

/** A property's names, the custom properties of the page after the browser's. */
export function nameSuggestions(world: CssWorld): string[] {
  return [...world.properties(), ...world.customs()];
}

/** A word no property takes as a keyword: where the browser takes it, the property takes any word, a name of the page's own. */
const ANY_WORD = "devknobs-any-word";

/**
 * What a property's value may be: its keywords, named colors where it takes
 * a color, `var()` of each custom property, and the global keywords. None
 * for a property the browser does not know.
 */
export function valueSuggestions(property: string, world: CssWorld): string[] {
  const name = property.trim().toLowerCase();
  const vars = world.customs().map((custom) => `var(${custom})`);
  if (name.startsWith("--")) return [...vars, ...GLOBAL_KEYWORDS];
  if (!world.supports(name, "inherit")) return [];
  const anyWord = world.supports(name, ANY_WORD);
  const own = NAMED_KEYWORDS[name] ?? [];
  const keywords = anyWord ? own : [...new Set([...KEYWORDS, ...own])].filter((word) => world.supports(name, word)).sort();
  const colors = !anyWord && world.supports(name, "red") ? NAMED_COLORS : [];
  return [...new Set([...keywords, ...colors, ...vars, ...GLOBAL_KEYWORDS])];
}

/**
 * The suggestions for what was typed: those that start with it first, then
 * those that hold it, case aside, at most `MOST`. Nothing typed keeps them all.
 */
export function matching(items: readonly string[], typed: string, most = MOST): string[] {
  const word = typed.toLowerCase();
  const starts: string[] = [];
  const holds: string[] = [];
  for (const item of items) {
    const lower = item.toLowerCase();
    if (lower.startsWith(word)) starts.push(item);
    else if (word !== "" && lower.includes(word)) holds.push(item);
  }
  return [...starts, ...holds].slice(0, most);
}

/** The word of a value the caret is in, which a suggestion takes the place of: after the last space, comma, slash or paren. */
export function wordAt(text: string, caret: number): { start: number; end: number; word: string } {
  let start = caret;
  while (start > 0 && !/[\s,/(]/.test(text[start - 1] ?? "")) start--;
  let end = caret;
  while (end < text.length && !/[\s,/()]/.test(text[end] ?? "")) end++;
  return { start, end, word: text.slice(start, caret) };
}

/** What a key does while the list is open: move the mark to `to`, close it, take the one marked, or nothing of the list's. */
export type ListKey = { act: "move"; to: number } | { act: "close" } | { act: "take" } | null;

/** What a key does to a list of `count`, marked at `at` (-1 for none), open or not. Down opens a closed one. */
export function listKey(event: Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey">, open: boolean, count: number, at: number): ListKey {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (!open) return event.key === "ArrowDown" && !event.shiftKey ? { act: "move", to: -1 } : null;
  if (event.key === "ArrowDown") return { act: "move", to: (at + 1) % count };
  if (event.key === "ArrowUp") return { act: "move", to: at <= 0 ? count - 1 : at - 1 };
  if (event.key === "Escape") return { act: "close" };
  if (event.key === "Enter") return { act: "take" };
  if (event.key === "Tab") return event.shiftKey ? { act: "close" } : { act: "take" };
  return null;
}

export interface Autocomplete {
  /** A key on the field. True where it was the list's own: the field leaves it alone. Enter and Tab take the one marked, else the first, and still go to the field. */
  key(event: KeyboardEvent): boolean;
  /** Whether the list shows. */
  open(): boolean;
  /** Close the list, and take it off the page. */
  close(): void;
  /**
   * Escape, as the panel hears it before the field: close the list where it
   * shows, and say so. The field then leaves that escape alone.
   */
  dismiss(): boolean;
}

/** How many lists were made, for their ids. */
let made = 0;

/**
 * Suggestions under a field: the whole of it for a name, the word at the
 * caret for a value. `items` is asked as the list opens.
 */
export function autocomplete(input: HTMLInputElement | HTMLTextAreaElement, items: () => string[], kind: "name" | "value"): Autocomplete {
  const list = el("div", "ac-list");
  const id = `devknobs-ac-${++made}`;
  list.id = id;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", kind === "name" ? "properties" : "values");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", id);
  let all: string[] | null = null;
  let shown: string[] = [];
  /** The suggestion marked, -1 for none. */
  let at = -1;
  let options: HTMLElement[] = [];
  /** The escape that closed the list from the panel, which the field is still to hear. */
  let ate = false;

  function place(): { start: number; end: number; word: string } {
    const text = input.value;
    if (kind === "name") return { start: 0, end: text.length, word: text.trim() };
    return wordAt(text, input.selectionStart ?? text.length);
  }

  function mark(to: number): void {
    at = to;
    options.forEach((option, index) => option.setAttribute("aria-selected", String(index === at)));
    const on = options[at];
    if (!on) {
      input.removeAttribute?.("aria-activedescendant");
      return;
    }
    input.setAttribute("aria-activedescendant", on.id);
    on.scrollIntoView?.({ block: "nearest" });
  }

  function close(): void {
    shown = [];
    options = [];
    list.replaceChildren();
    list.remove();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute?.("aria-activedescendant");
  }

  function take(value: string): void {
    const { start, end } = place();
    const text = input.value;
    input.value = `${text.slice(0, start)}${value}${text.slice(end)}`;
    const caret = start + value.length;
    input.setSelectionRange?.(caret, caret);
    close();
    // The field fits its width to what it holds.
    input.dispatchEvent?.(new Event("input"));
  }

  /** Open the list for what is typed now, or close it where nothing is left to suggest. */
  function update(): void {
    all ??= items();
    const { word } = place();
    const found = matching(all, word);
    if (found.length === 0 || (found.length === 1 && found[0] === word)) {
      close();
      return;
    }
    shown = found;
    options = found.map((value, index) => {
      const option = el("div", "ac-item", value);
      option.id = `${id}-${index}`;
      option.setAttribute("role", "option");
      // Pressed, not clicked, so the field keeps the focus.
      option.addEventListener("pointerdown", (event: Event) => event.preventDefault());
      option.addEventListener("click", () => {
        take(value);
        input.focus({ preventScroll: true });
      });
      return option;
    });
    list.replaceChildren(...options);
    if (!list.parentNode) input.parentNode?.append(list);
    list.style.left = `${input.offsetLeft ?? 0}px`;
    list.style.top = `${(input.offsetTop ?? 0) + (input.offsetHeight ?? 0)}px`;
    input.setAttribute("aria-expanded", "true");
    mark(-1);
  }

  input.addEventListener("input", (event: Event) => {
    // A suggestion taken says so too, and leaves the list closed.
    if (event.isTrusted === false && shown.length === 0) return;
    update();
  });
  input.addEventListener("blur", close);
  // What a value may be follows the name, which may have changed since.
  input.addEventListener("focus", () => {
    all = null;
  });

  return {
    key(event) {
      if (event.isComposing) return false;
      if (event.key === "Escape" && ate) {
        ate = false;
        event.preventDefault();
        return true;
      }
      const what = listKey(event, shown.length > 0, shown.length, at);
      if (!what) return false;
      if (what.act === "take") {
        const value = shown[Math.max(at, 0)];
        if (value !== undefined && value !== place().word) take(value);
        else close();
        return false;
      }
      event.preventDefault();
      if (what.act === "close") close();
      else if (shown.length === 0) {
        // Down opens the list for what is typed, the first marked.
        update();
        if (shown.length > 0) mark(0);
      } else mark(what.to);
      return what.act !== "close" || event.key === "Escape";
    },
    open: () => shown.length > 0,
    close,
    dismiss() {
      if (shown.length === 0) return false;
      close();
      ate = true;
      // The same keydown reaches the field at once, or never.
      setTimeout(() => {
        ate = false;
      }, 0);
      return true;
    },
  };
}
