/**
 * States forced on an element, as the browsers' tools force them: the
 * element renders, and the styles engine reads it, as if it were hovered,
 * focused or pressed. A page's script cannot set those states, so they are
 * emulated. The element carries `data-devknobs-force` with the states, its
 * ancestors with those the states bring to them (`hover`, `active`,
 * `focus-within`), and every rule of the page whose selector has one of the
 * states is copied into a stylesheet of devknobs' own, with each such
 * pseudo-class `:hover` written `:is(:hover, [data-devknobs-force~="hover"])`:
 * as heavy as before, and true where the page has the state for real too.
 * The element carries `data-knobs-force` too, which the copied rules leave
 * out: every copy writes the old name, an older one on the page only that.
 * The copy keeps the `@media`, `@supports`, `@container`, `@layer` and
 * `@scope` around a rule, and nested rules come out whole. One element at a
 * time. Forcing is no edit: the log never sees it. To use it:
 *
 *   forceState(element, ["hover"]);   // the states now forced
 *   syncForced();                     // after the page's stylesheets changed
 *   clearForced();
 *
 * Where it falls short: a stylesheet from another origin cannot be read, so
 * its rules are not copied; a copied rule comes after the page's rules, so it
 * wins a tie of equal weight that the page's own order would have lost; a
 * state is on the element and its ancestors only, so `:has()` finds it there
 * and nowhere else, as with a real hover; a selector the browser will not
 * take once written so is left out; an `@scope` with no start is scoped to
 * the whole document; a rule in a `@layer` with no name is not copied, as a
 * copy would be a layer of its own; and `:visited` is not forced, as
 * browsers hide it from a page. A rule nested in a list that has a state in only some of its
 * selectors, as `.a:hover, .b { .icon { } }`, is copied under the whole list,
 * `:is(.a:hover, .b) .icon`, so it applies again to `.b .icon` too.
 */

import { addStyle, ensureStyle, isOwnSheet, type OwnStyle, removeStyle } from "../engine/style";
import { isNewRuleSheet } from "../edit/rule";
import { isDevknobs } from "../grab/hit";
import { resolveNesting, splitList } from "./selector";
import { flatParent, isShadowRoot, type Scope, scopeOf } from "./tree";
import { ATTRIBUTES, getMark, removeMark, setMark } from "../mark";

/** The states that can be forced, in the order the view shows them. */
export const FORCED_STATES = ["hover", "focus", "focus-visible", "active", "focus-within"] as const;
export type ForcedState = (typeof FORCED_STATES)[number];

/** The attribute that carries the states forced, on the element and on its ancestors. */
export const FORCE_ATTRIBUTE = ATTRIBUTES.force;

/** The name of the document's stylesheet of copied rules. */
const SHEET = "force";

/** What a state on the element makes its ancestors match too. */
const UP: Record<ForcedState, ForcedState> = {
  hover: "hover",
  active: "active",
  focus: "focus-within",
  "focus-visible": "focus-within",
  "focus-within": "focus-within",
};

/** What a state on the element makes the element match too: one focused is focused within. */
const ALSO: Record<ForcedState, ForcedState[]> = {
  hover: [],
  active: [],
  focus: ["focus-within"],
  "focus-visible": ["focus", "focus-within"],
  "focus-within": [],
};

function isState(name: string): name is ForcedState {
  return FORCED_STATES.some((state) => state === name);
}

interface Forced {
  element: Element;
  states: ForcedState[];
  /** The elements that carry the attribute, each with the value it had before, null for none. */
  marked: { element: Element; before: string | null }[];
  /** The trees whose rules are copied, each with its stylesheet of copies. */
  sheets: Map<Scope, OwnStyle>;
}

let current: Forced | null = null;
/** Each selector as matched while a state is forced. */
const written = new Map<string, string>();

/** Past the string whose quote is at `at`. */
function stringEnd(text: string, at: number): number {
  const quote = text[at];
  let i = at + 1;
  while (i < text.length && text[i] !== quote) i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}

/** Past the attribute selector that opens at `at`. */
function attributeEnd(text: string, at: number): number {
  let i = at + 1;
  while (i < text.length && text[i] !== "]") {
    if (text[i] === "\\") i += 2;
    else if (text[i] === '"' || text[i] === "'") i = stringEnd(text, i);
    else i++;
  }
  return i + 1;
}

/** A selector with each state written so the attribute stands in for it, and the states it has. */
function rewrite(selector: string): { text: string; states: Set<ForcedState> } {
  const states = new Set<ForcedState>();
  let text = "";
  let i = 0;
  while (i < selector.length) {
    const char = selector[i] ?? "";
    let end = i + 1;
    if (char === "\\") end = i + 2;
    else if (char === '"' || char === "'") end = stringEnd(selector, i);
    else if (char === "[") end = attributeEnd(selector, i);
    else if (char === ":" && selector[i + 1] === ":") end = i + 2;
    else if (char === ":") {
      const name = /^[\w-]*/.exec(selector.slice(i + 1))?.[0] ?? "";
      end = i + 1 + name.length;
      const lower = name.toLowerCase();
      if (isState(lower) && selector[end] !== "(") {
        states.add(lower);
        text += `:is(:${lower}, [${FORCE_ATTRIBUTE}~="${lower}"])`;
        i = end;
        continue;
      }
    }
    text += selector.slice(i, end);
    i = end;
  }
  return { text, states };
}

/** A selector as it matches while states are forced. The same where it has none of them. */
export function forcedSelector(selector: string): string {
  let known = written.get(selector);
  if (known === undefined) {
    known = rewrite(selector).text;
    written.set(selector, known);
  }
  return known;
}

/** Whether a state is forced anywhere now. */
export function forcing(): boolean {
  return current !== null;
}

/** The element whose states are forced, and the states. Null with none. */
export function forcedState(): { element: Element; states: ForcedState[] } | null {
  return current ? { element: current.element, states: [...current.states] } : null;
}

/** The rule classes copied, by name: `instanceof` fails across windows. */
interface Kinds {
  CSSStyleRule: CSSStyleRule;
  CSSNestedDeclarations: CSSNestedDeclarations;
  CSSImportRule: CSSImportRule;
  CSSMediaRule: CSSMediaRule;
  CSSSupportsRule: CSSSupportsRule;
  CSSContainerRule: CSSContainerRule;
  CSSLayerBlockRule: CSSLayerBlockRule;
  CSSScopeRule: CSSScopeRule;
}

function isKind<K extends keyof Kinds>(rule: CSSRule, kind: K): rule is Kinds[K] {
  return rule.constructor.name === kind;
}

/** The selector list of a rule, standing alone, `&` put in for the rule it is nested in. */
function standalone(selector: string, parent: string | null): string {
  if (parent === null) return selector;
  return splitList(selector)
    .map((part) => resolveNesting(part, parent))
    .join(", ");
}

/**
 * The copies of the rules that have a state forced now, in their order, each
 * in what it sits in. `whole` copies every rule, as in an `@scope` whose
 * limits have a state forced.
 */
function copies(rules: CSSRuleList, parent: string | null, wanted: ReadonlySet<ForcedState>, whole = false): string[] {
  const out: string[] = [];
  const wrap = (head: string, inner: string[]): void => {
    if (inner.length > 0) out.push(`${head} { ${inner.join(" ")} }`);
  };
  // Only the selectors of a list with a state wanted: the others would apply again, after the page's rules.
  const copy = (selector: string, body: string): void => {
    if (body.trim() === "") return;
    const kept = splitList(selector)
      .map(rewrite)
      .filter(({ states }) => whole || [...states].some((state) => wanted.has(state)))
      .map(({ text }) => text);
    if (kept.length > 0) out.push(`${kept.join(", ")} { ${body} }`);
  };
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;
    try {
      if (isKind(rule, "CSSStyleRule")) {
        const selector = standalone(rule.selectorText, parent);
        copy(selector, rule.style.cssText);
        if (rule.cssRules?.length) out.push(...copies(rule.cssRules, selector, wanted, whole));
      } else if (isKind(rule, "CSSNestedDeclarations")) {
        if (parent !== null) copy(resolveNesting("&", parent), rule.style.cssText);
      } else if (isKind(rule, "CSSMediaRule")) {
        wrap(`@media ${rule.media.mediaText}`, copies(rule.cssRules, parent, wanted, whole));
      } else if (isKind(rule, "CSSSupportsRule")) {
        wrap(`@supports ${rule.conditionText}`, copies(rule.cssRules, parent, wanted, whole));
      } else if (isKind(rule, "CSSContainerRule")) {
        wrap(`@container ${rule.conditionText}`, copies(rule.cssRules, parent, wanted, whole));
      } else if (isKind(rule, "CSSLayerBlockRule")) {
        // A layer with no name is another one each time it is written: a copy would not keep its place.
        if (rule.name) wrap(`@layer ${rule.name}`, copies(rule.cssRules, parent, wanted, whole));
      } else if (isKind(rule, "CSSScopeRule")) {
        // Nested in a rule, the scope starts from what that rule styles.
        const start = parent === null ? rule.start : rule.start ? resolveNesting(rule.start, parent) : parent;
        const end = parent !== null && rule.end ? resolveNesting(rule.end, parent) : rule.end;
        const limits = start ? ` (${start})${end ? ` to (${end})` : ""}` : "";
        // Limits with a state forced: every rule in it may now apply, as written there.
        const stated = [start, end].some((one) => one !== null && [...rewrite(one).states].some((state) => wanted.has(state)));
        wrap(`@scope${limits ? rewrite(limits).text : ""}`, copies(rule.cssRules, null, wanted, whole || stated));
      } else if (isKind(rule, "CSSImportRule")) {
        if (rule.styleSheet) out.push(...sheetCopies(rule.styleSheet, wanted, rule));
      }
    } catch {
      // A rule that cannot be read is not copied.
    }
  }
  return out;
}

/** The copies of a stylesheet's rules, in its `@media` and, for an import, its layer and `@supports`. */
function sheetCopies(sheet: CSSStyleSheet, wanted: ReadonlySet<ForcedState>, imported?: CSSImportRule): string[] {
  let rules: CSSRuleList;
  try {
    // A stylesheet from another origin throws here, and is left as it is.
    rules = sheet.cssRules;
  } catch {
    return [];
  }
  let inner = copies(rules, null, wanted);
  if (inner.length === 0) return [];
  const media = (imported ? imported.media.mediaText : sheet.media.mediaText) ?? "";
  if (media) inner = [`@media ${media} { ${inner.join(" ")} }`];
  if (imported?.supportsText) inner = [`@supports ${imported.supportsText} { ${inner.join(" ")} }`];
  if (imported && imported.layerName != null) inner = [`${imported.layerName ? `@layer ${imported.layerName}` : "@layer"} { ${inner.join(" ")} }`];
  return inner;
}

/** The copies of every rule of a tree that has a state wanted. */
export function mirrorText(scope: Scope, wanted: ReadonlySet<ForcedState>): string {
  const sheets = [...Array.from(scope.styleSheets), ...(scope.adoptedStyleSheets ?? [])];
  const out: string[] = [];
  for (const sheet of sheets) {
    try {
      if (sheet.disabled) continue;
      // devknobs' own are left out, but for the rules added from the styles view.
      const owner = sheet.ownerNode;
      const own = isOwnSheet(sheet) || (owner !== null && "hasAttribute" in owner && isDevknobs(owner));
      if (own && !isNewRuleSheet(sheet)) continue;
      out.push(...sheetCopies(sheet, wanted));
    } catch {
      // A stylesheet that cannot be read is left as it is.
    }
  }
  return out.join("\n");
}

/** The states each element carries: the element its own, each ancestor those they bring. */
function marks(element: Element, states: readonly ForcedState[]): Map<Element, ForcedState[]> {
  const own = new Set<ForcedState>(states);
  for (const state of states) for (const also of ALSO[state]) own.add(also);
  const result = new Map<Element, ForcedState[]>([[element, FORCED_STATES.filter((state) => own.has(state))]]);
  const up = new Set(states.map((state) => UP[state]));
  const brought = FORCED_STATES.filter((state) => up.has(state));
  for (let at = flatParent(element); at; at = flatParent(at)) result.set(at, brought);
  return result;
}

/** The stylesheet of copies for a tree, made once. */
function sheetFor(forced: Forced, scope: Scope): OwnStyle {
  let style = forced.sheets.get(scope);
  if (!style) {
    style = isShadowRoot(scope) ? addStyle(scope, "") : ensureStyle(SHEET, scope);
    forced.sheets.set(scope, style);
  }
  return style;
}

/** Copy the rules again, as the page's stylesheets are now. */
export function syncForced(): void {
  const forced = current;
  if (!forced) return;
  const wanted = new Set<ForcedState>();
  const scopes = new Set<Scope>();
  for (const { element } of forced.marked) {
    for (const state of (getMark(element, FORCE_ATTRIBUTE) ?? "").split(" ")) if (isState(state)) wanted.add(state);
    scopes.add(scopeOf(element));
    // A host's own shadow root holds its `:host(:hover)` rules.
    if (element.shadowRoot) scopes.add(element.shadowRoot);
  }
  for (const scope of scopes) {
    const text = mirrorText(scope, wanted);
    const style = sheetFor(forced, scope);
    if (style.textContent !== text) style.textContent = text;
  }
}

/** Take every forced state off the page. */
export function clearForced(): void {
  const forced = current;
  if (!forced) return;
  current = null;
  written.clear();
  for (const { element, before } of forced.marked) {
    try {
      if (before === null) removeMark(element, FORCE_ATTRIBUTE);
      else setMark(element, FORCE_ATTRIBUTE, before);
    } catch {
      // An element of a page that went.
    }
  }
  for (const [scope, style] of forced.sheets) {
    try {
      if (isShadowRoot(scope)) style.remove();
      else removeStyle(SHEET, scope);
    } catch {
      // A page that went takes its stylesheet with it.
    }
  }
}

/**
 * Force states on an element, those on another taken off first. The states
 * are names such as `hover` or `:hover`; ones that cannot be forced are left
 * out. With none, or no element, nothing is forced. Returns the states forced.
 */
export function forceState(element: Element | null, states: readonly string[]): ForcedState[] {
  const names = new Set(states.map((state) => state.trim().replace(/^:/, "").toLowerCase()));
  const chosen = FORCED_STATES.filter((state) => names.has(state));
  clearForced();
  if (!element || chosen.length === 0 || isDevknobs(element)) return [];
  const forced: Forced = { element, states: chosen, marked: [], sheets: new Map() };
  for (const [one, own] of marks(element, chosen)) {
    if (own.length === 0) continue;
    forced.marked.push({ element: one, before: getMark(one, FORCE_ATTRIBUTE) });
    setMark(one, FORCE_ATTRIBUTE, own.join(" "));
  }
  current = forced;
  syncForced();
  return [...chosen];
}

/** The forcing as the styles view drives it, so a test can stand in for it. */
export interface Forcing {
  state: typeof forcedState;
  set: typeof forceState;
  clear: typeof clearForced;
  sync: typeof syncForced;
  on: typeof forcing;
}

export const FORCING: Forcing = { state: forcedState, set: forceState, clear: clearForced, sync: syncForced, on: forcing };
