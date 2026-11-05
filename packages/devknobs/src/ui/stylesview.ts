/**
 * The styles view of the panel: the rules that reach one element, as the
 * engine in `../styles` ranks them, read only. A line of crumbs heads it, a
 * bar with a filter stays on top, and under them a block for each rule, the
 * element's own first, then its pseudo-elements', then what each ancestor
 * hands down. That is its advanced mode. Its simple mode lists only what
 * applies to the element, with no rule around it, and what it inherits folded
 * under that. In both modes the element's box heads the styles, in a fold of
 * its own. Its bar starts with the select button, which turns the picking on
 * and off. With no element there is no bar, and the empty line is the button
 * that starts the picking, while that is off. Its bar, toggle, filter, modes,
 * folds and empty lines are the kit's, and only the crumbs, the box and the
 * css are its own. Nothing of it is drawn on
 * the page, but for a box on the element a crumb or the box's diagram stands
 * for, while the pointer is on that. To use it:
 *
 *   const view = createStylesView({ tips, title, outline, held, area, mode, box, select });
 *   body.append(view.node); view.show(element); view.destroy();
 *
 * The view is built once for each inspection, and the filter only hides what
 * is built, and all of it wraps or is cut short at whatever width the panel
 * is dragged to. It reads the styles again when what they depend on changes: the
 * element or an ancestor of it, the stylesheets in the head, the window's
 * size and the knobs, and the box alone when the element's size does. The
 * element may be one of the device frame's page.
 *
 * With a log to edit into, chips over the rules force a state on the element,
 * `:hover` say: the page draws it so and the rules show as they apply then.
 * That is no edit, and it ends when another element is shown or the view
 * goes. A line under the element's rules adds a new rule, listed with them
 * whether or not it matches the element.
 */

import * as engine from "../engine";
import type { Off } from "../edit/css";
import type { EditLog } from "../edit/log";
import { NEW_RULE_SHEET, newRulesFor } from "../edit/rule";
import type { Locate } from "../edit/source";
import { inspect, invalidate } from "../styles";
import { parseDeclarations, variableNames } from "../styles/declarations";
import { FORCED_STATES, type ForcedState, FORCING, type Forcing } from "../styles/force";
import { specificity, splitList } from "../styles/selector";
import { flatParent, label } from "../styles/tree";
import type {
  Inspection,
  OwnBlock,
  RuleBlock,
  StyleBlock,
  StyleDeclaration,
} from "../styles/types";
import type { BoxRing } from "../grab/boxmodel";
import type { DevknobsState } from "../types";
import { type BoxReading, createBoxDiagram, readBox } from "./boxdiagram";
import { createCssEditor, newRuleSelector, offDeclaration, type Place, styleOf } from "./cssedit";
import { button, el } from "./dom";
import { emptyAction, emptyLine, type Fold, filterField, sectionFold, segments, toolbar, toolToggle } from "./kit";
import type { HtmlSize, StylesMode } from "./prefs";
import {
  type Applied,
  appliedInherited,
  appliedOwn,
  grouped,
  hiddenNote,
  NO_STYLES,
  resolvedValue,
} from "./stylesapplied";
import {
  crumbText,
  declaredIn,
  hiddenLine,
  matchesFilter,
  middle,
  sourceOf,
  swatchOf,
  TITLE_MAX,
  valueParts,
  variableTip,
} from "./stylesformat";
import type { Tips } from "./tooltip";

/** How long the page is left to settle after a change before its styles are read again, in ms. */
export const SETTLE = 120;

/** How long the block that sets a custom property stays lit after a click on its name, in ms. */
const FLASH = 900;

/** What the view says before an element is picked, when one left, and when nothing is to show. */
export const EMPTY = "pick an element to see its styles";
export const GONE = "the element left the page";
/** What the same two lines say as a button, with the picking off: what a press does. */
export const PICK = "select an element to see its styles";
export const GONE_PICK = "the element left the page, select another";
export const NO_RULES = "no rule reaches this element";
export const NO_MATCH = "no declaration matches";
/** What a stylesheet the page may not read says, as none of its rules can be edited. */
export const READ_ONLY = "read only: the browser does not let a page read or edit a stylesheet from another origin, or its own default styles";

/** What the view needs from the panel. */
export interface StylesContext {
  tips: Tips;
  /** Say what is shown in the view's head. */
  title(text: string): void;
  /** Put a quiet box on an element the view points at, or with null take it off. */
  outline(element: Element | null): void;
  /** The element the view holds now, or null once it holds none: another was shown, or it left. */
  held?(element: Element | null): void;
  /**
   * The mode the view starts in, and where the one the user picks is kept.
   * Without it the view is the advanced one, with no control to change it.
   */
  mode?: { get(): StylesMode; set(mode: StylesMode): void };
  /** Tint one area of the outlined element's box alone on the page, or with null all four. */
  area?(ring: BoxRing | null): void;
  /** Whether the box starts folded out, and where the way the user leaves it is kept. */
  box?: { get(): boolean; set(open: boolean): void };
  /** Whether the Elements view's changes start with their diff shown, and where the way the user leaves them is kept. */
  diff?: { get(): boolean; set(open: boolean): void };
  /** How tall the Elements view's html editor starts, and where the size the user gives it is kept. */
  htmlSize?: { get(): HtmlSize; set(size: HtmlSize): void };
  /**
   * The picking, for the select button the bar starts with, and for the
   * empty line, which starts it with no element shown and the picking off.
   * Without it the bar has no such button, and the line is only words.
   */
  select?: {
    /** What the button is called. */
    label: string;
    /** What its tooltip says after the label: the key that does the same, as it is now. */
    hint?(): string;
    /** Whether the picking is on. */
    on(): boolean;
    /** The button was pressed. */
    run(): void;
    /** Hear the picking go on or off, however it did. Returns the way to stop. */
    watch(listener: () => void): () => void;
  };
  /** The log the view's edits go to. Without it the view is read only. */
  edits?: EditLog;
  /** Where an edited element is written, for its edit's target. Defaults to grab's lookup. */
  locate?: Locate;
}

/** The modes in the order their control has them. */
const MODES: readonly StylesMode[] = ["simple", "advanced"];

/** What the view reads the page through, so a test can stand in for each. */
export interface StylesPage {
  inspect: typeof inspect;
  invalidate: typeof invalidate;
  getState(): DevknobsState;
  subscribe(listener: (state: DevknobsState) => void): () => void;
  /** The browser's word on whether a text is a color. */
  isColor(text: string): boolean;
  /** The element's box, or null where it has none to read. */
  box(element: Element): BoxReading | null;
  /** What an element, or one of its pseudo-elements, sees for a custom property now. Empty for one not set. */
  variable(element: Element, pseudo: string | null, name: string): string;
  /** The states forced on the page's elements. Defaults to the page's own. */
  force?: Forcing;
}

/**
 * A custom property as the element's computed style has it: the computed
 * value of one `@property` registered, and for any other its text with the
 * properties it reads in turn put in. It is asked of the element's own
 * window, the device frame's for a page shown in it.
 */
export function readVariable(element: Element, pseudo: string | null, name: string): string {
  try {
    const view = element.ownerDocument.defaultView;
    return view ? view.getComputedStyle(element, pseudo).getPropertyValue(name).trim() : "";
  } catch {
    return "";
  }
}

function isColor(text: string): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("color", text);
  } catch {
    return false;
  }
}

const PAGE: StylesPage = {
  inspect,
  invalidate,
  getState: engine.getState,
  subscribe: engine.subscribe,
  isColor,
  box: readBox,
  variable: readVariable,
};

export interface StylesView {
  /** The view's node, which goes in the body of the panel's view. */
  node: HTMLElement;
  /** Show an element's styles, or those of one of its pseudo-elements. Null shows the empty state. */
  show(element: Element | null, pseudo?: string): void;
  /** Read the styles again now, as after the frame loaded another page. */
  refresh(): void;
  /** Escape clears the filter where it has text, and says whether it did. */
  escape(): boolean;
  /** Take the focus, on no control, so the keys of the picking stay its own. */
  focus(): void;
  destroy(): void;
}

/** A declaration's line, and what the filter reads of it. */
interface Line {
  node: HTMLElement;
  declaration: StyleDeclaration;
}

/** A block as built, with the heading of the group it is in, if any. */
interface Built {
  node: HTMLElement;
  lines: Line[];
  group: HTMLElement | null;
  /** The element's own style drawn empty, to add a property to: no rule, so not one that reaches it. */
  blank: boolean;
}

/** A group of the simple mode's lines, with its label where the groups have one. */
interface LineSet {
  node: HTMLElement;
  label: HTMLElement | null;
  lines: Line[];
}

/** The simple mode as built: the element's own lines by group, and what it inherits. */
interface Flat {
  /** The box of the own lines, or the line that says there are none. */
  own: HTMLElement;
  sets: LineSet[];
  /** The new rules made for the element, each a block of its own. */
  rules: Built[];
  inherited: { fold: Fold; lines: Line[] } | null;
}

/** The id of the element's own style drawn empty, which no inspection gives a block. */
const BLANK = -1;

/** The ids of new rules that do not match the element, which no inspection gives a block, counting down. */
const UNMATCHED = -2;

/** What the chips that force a state are called, as a group. */
export const FORCE_LABEL = "force a state";

/** A new rule that does not match the element, as a block: its selector off, its declarations struck through. */
function unmatched(rule: CSSStyleRule, id: number): RuleBlock {
  return {
    kind: "rule",
    id,
    selectorText: rule.selectorText,
    selector: splitList(rule.selectorText).map((text) => ({ text, matches: false })),
    specificity: specificity(rule.selectorText),
    origin: { sheet: NEW_RULE_SHEET, owner: null, path: [0] },
    context: [],
    declarations: parseDeclarations(rule.style.cssText).map((written) => ({
      ...written,
      longhands: [written.name],
      overridden: true,
      variables: variableNames(written.value),
    })),
    rule,
  };
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/** Only devknobs' own nodes came or went: a box it draws, a style element it brings. */
function isOwn(record: MutationRecord): boolean {
  if (record.type !== "childList") return false;
  const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
  return (
    nodes.length > 0 && nodes.every((node) => isElement(node) && node.hasAttribute("data-devknobs"))
  );
}

/** The knobs as one text, the panel's own state aside: it moves nothing on the page. */
function knobsOf(state: DevknobsState): string {
  return JSON.stringify({ ...state, panel: null });
}

export function createStylesView(context: StylesContext, page: StylesPage = PAGE): StylesView {
  const { tips } = context;
  const force = page.force ?? FORCING;
  const node = el("div", "styles");
  // Takes the focus from script only, and the tab key goes on to its controls.
  node.tabIndex = -1;
  const crumbs = el("div", "crumbs");
  crumbs.setAttribute("role", "group");
  crumbs.setAttribute("aria-label", "the element and its ancestors");
  const filter = filterField({
    placeholder: "filter",
    label: "filter the declarations",
    onInput: () => applyFilter(),
  });
  let mode: StylesMode = context.mode?.get() ?? "advanced";
  const modes = context.mode
    ? segments({
        options: MODES.map((value) => ({ value, label: value })),
        label: "how the styles are shown",
        value: mode,
        onChange: setMode,
      })
    : null;
  const { select } = context;
  const picker = select
    ? toolToggle({
        label: select.label,
        icon: "square-dashed-mouse-pointer",
        on: select.on(),
        onPress: select.run,
      })
    : null;
  /** The empty line as a button, which starts the picking. */
  const again = select ? emptyAction(PICK, select.run) : null;
  if (select) {
    const told = (): string => [select.label, select.hint?.()].filter(Boolean).join(" · ");
    if (picker) tips.tooltip(picker.node, told);
    if (again) tips.tooltip(again, told);
  }
  // Stays on top while the blocks scroll under it. The select button is first, at its left start.
  const bar = toolbar([picker?.node, filter.node, modes?.node].filter((part) => part != null));
  const diagram = createBoxDiagram((ring) => context.area?.(ring));
  const box = sectionFold({
    label: "box",
    open: context.box?.get() ?? true,
    onToggle: (open) => context.box?.set(open),
  });
  box.body.append(diagram.node);
  // The diagram stands for the element: its box shows on the page while the
  // pointer is on it, one area of it alone where the diagram says.
  diagram.node.addEventListener("pointerenter", () => point(target));
  diagram.node.addEventListener("pointerleave", () => point(null));
  const blocks = el("div", "css-blocks");
  const note = emptyLine(EMPTY);
  const log = context.edits ?? null;
  /** The chips that force a state on the element, while the view can edit. */
  const chips = log ? el("div", "chips force-states") : null;
  const stateChips = new Map<ForcedState, HTMLButtonElement>();
  if (chips) {
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", FORCE_LABEL);
    for (const state of FORCED_STATES) {
      const chip = button("chip", `:${state}`);
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", () => toggleState(state));
      stateChips.set(state, chip);
      chips.append(chip);
    }
  }
  node.append(...[crumbs, bar, box.node, chips, blocks, note].filter((part) => part !== null));
  if (again) node.append(again);
  /** Tells the diagram how wide it is, so it knows whether its lengths fit in it. */
  const fitter =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          const entry = entries[entries.length - 1];
          if (entry) diagram.fit(entry.contentRect.width);
        });
  fitter?.observe(diagram.node);

  let target: Element | null = null;
  let pseudo: string | null = null;
  /** The pseudo-elements the element was last seen to have rules for. */
  let pseudos: string[] = [];
  /** What the engine last said, and of which element, to draw again in the other mode. */
  let read: { found: Inspection; element: Element } | null = null;
  let built: Built[] = [];
  /** The simple mode's lines, while that is the mode shown. */
  let flat: Flat | null = null;
  /** What the element inherits is folded out, in the simple mode. */
  let unfolded = false;
  /** The blocks by their id in the inspection shown. */
  let byId = new Map<number, HTMLElement>();
  /** The nodes of the blocks that have a tooltip, which goes when they do. */
  let tipped: HTMLElement[] = [];
  /** Where each custom property asked about is set, for the inspection shown. */
  let sources = new Map<string, string | null>();
  let observer: MutationObserver | null = null;
  /** Watches the element's size, which its box goes by, while it is shown. */
  let sizes: ResizeObserver | null = null;
  /** The window whose size the styles shown depend on. */
  let watched: Window | null = null;
  /** A stylesheet may have changed since the last read. */
  let stale = false;
  let knobs = knobsOf(page.getState());
  let timer = 0;
  let flashTimer = 0;
  let lit: HTMLElement | null = null;
  /** The line said in place of the styles, and what it says as a button. */
  let said: { text: string | null; press: string | null } = { text: null, press: null };
  /** Stops hearing the picking go on and off. */
  const unpick =
    select?.watch(() => {
      picker?.set(select.on());
      drawSaid();
    }) ?? null;
  /** The styles were to be read again while the editor was busy. */
  let waiting = false;
  const editor = log
    ? createCssEditor({
        log,
        node,
        locate: context.locate,
        settled() {
          if (!waiting) return;
          waiting = false;
          refresh();
        },
      })
    : null;
  /** The crumb the pointer is on, whose element is boxed on the page for as long. */
  let pointed: HTMLElement | null = null;
  /** Whether the view has an element boxed on the page. */
  let pointing = false;

  /** The states forced on the element shown, none where another is forced. */
  function statesHere(): ForcedState[] {
    const forced = force.state();
    return target && forced?.element === target ? forced.states : [];
  }

  /** Show which states are forced, the chips only with an element shown. */
  function drawChips(): void {
    if (!chips) return;
    chips.hidden = target === null || bar.hidden;
    const states = statesHere();
    for (const [state, chip] of stateChips) {
      const on = states.includes(state);
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  /** Force a state on the element, or take it off. */
  function toggleState(state: ForcedState): void {
    if (!target) return;
    const states = statesHere();
    force.set(target, states.includes(state) ? states.filter((one) => one !== state) : [...states, state]);
    drawChips();
    refresh();
  }

  /** Take off the states forced on an element the view leaves. */
  function unforce(element: Element | null): void {
    if (element && force.state()?.element === element) force.clear();
  }

  /** Box an element on the page while the pointer is on what stands for it, or with null take the box off. */
  function point(element: Element | null): void {
    if (!element && !pointing) return;
    pointing = element !== null;
    context.outline(element);
  }

  function later(): void {
    clearTimeout(timer);
    timer = window.setTimeout(refresh, SETTLE);
  }

  function onMutations(records: MutationRecord[]): void {
    const theirs = records.filter((record) => !isOwn(record));
    if (theirs.length === 0) return;
    const head = target?.ownerDocument.head;
    if (head && theirs.some((record) => head.contains(record.target))) stale = true;
    later();
  }

  /** Read the element's box again and show it. A pseudo-element's box cannot be read, so none shows. */
  function drawBox(): void {
    const reading = target && pseudo === null && target.isConnected ? page.box(target) : null;
    box.node.hidden = reading === null;
    diagram.show(reading);
  }

  function unwatch(): void {
    observer?.disconnect();
    observer = null;
    sizes?.disconnect();
    sizes = null;
    watched?.removeEventListener("resize", later);
    watched = null;
  }

  /**
   * One observer for all the element's styles can change with on the page: its
   * own attributes, each ancestor's and what comes and goes under it, which
   * also tells when the element itself is taken out, and the head's stylesheets.
   */
  function watch(element: Element): void {
    unwatch();
    observer = new MutationObserver(onMutations);
    observer.observe(element, { attributes: true });
    for (let up = flatParent(element); up; up = flatParent(up)) {
      observer.observe(up, { attributes: true, childList: true });
    }
    const head = element.ownerDocument.head;
    if (head) {
      observer.observe(head, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    }
    watched = element.ownerDocument.defaultView;
    watched?.addEventListener("resize", later);
    if (typeof ResizeObserver !== "undefined") {
      sizes = new ResizeObserver(drawBox);
      sizes.observe(element);
    }
  }

  /**
   * Say a line in place of the styles, or with null none. `press` is what it
   * says as a button, where a press of it starts the picking: it is that with
   * the picking off, and only words while it is on.
   */
  function say(text: string | null, press: string | null = null): void {
    said = { text, press };
    drawSaid();
  }

  function drawSaid(): void {
    const { text, press } = said;
    const asks = again !== null && press !== null && select?.on() === false;
    note.hidden = text === null || asks;
    if (text !== null) note.textContent = text;
    if (!again) return;
    again.hidden = !asks;
    if (press !== null) again.textContent = press;
  }

  /** Give a node of the blocks a tooltip. */
  function tip(control: HTMLElement, text: string | (() => string | Node)): void {
    tips.tooltip(control, text);
    tipped.push(control);
  }

  /** The blocks are about to go: so does a tooltip one of their nodes shows. */
  function dropTips(): void {
    if (tipped.some((control) => tips.isFor(control))) tips.hide();
    tipped = [];
  }

  function clear(text: string, press: string): void {
    dropTips();
    read = null;
    sources = new Map();
    built = [];
    editor?.begin();
    flat = null;
    byId = new Map();
    blocks.replaceChildren();
    crumbs.replaceChildren();
    crumbs.hidden = true;
    bar.hidden = true;
    drawChips();
    drawBox();
    say(text, press);
  }

  /** A crumb or a heading that shows something else when pressed. */
  function link(className: string, text: string, go: () => void): HTMLButtonElement {
    const control = button(className, text);
    control.addEventListener("click", go);
    return control;
  }

  /** The arrows walk the crumbs, which are one stop for the tab key. */
  function onCrumbKey(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const all = Array.from(crumbs.querySelectorAll<HTMLElement>("button"));
    const at = all.findIndex((crumb) => crumb.tabIndex === 0);
    const next = all[at + (event.key === "ArrowRight" ? 1 : -1)];
    const current = all[at];
    if (!next || !current) return;
    event.preventDefault();
    event.stopPropagation();
    current.tabIndex = -1;
    next.tabIndex = 0;
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  crumbs.addEventListener("keydown", onCrumbKey);

  /** The ancestors from the outermost in, the element, then its pseudo-elements. */
  function drawCrumbs(element: Element): void {
    const chain: Element[] = [];
    for (let up: Element | null = element; up; up = flatParent(up)) chain.unshift(up);
    const nodes: HTMLElement[] = [];
    const add = (text: string, current: boolean, of: Element, go: () => void) => {
      if (nodes.length > 0) {
        const mark = el("span", "crumb-sep", "›");
        mark.setAttribute("aria-hidden", "true");
        nodes.push(mark);
      }
      const crumb = link("crumb", text, go);
      crumb.addEventListener("pointerenter", () => {
        pointed = crumb;
        point(of);
      });
      crumb.addEventListener("pointerleave", () => {
        pointed = null;
        point(null);
      });
      crumb.tabIndex = current ? 0 : -1;
      if (current) crumb.setAttribute("aria-current", "true");
      nodes.push(crumb);
    };
    for (const one of chain) {
      add(crumbText(label(one)), one === element && pseudo === null, one, () => show(one));
    }
    for (const name of pseudos) add(name, name === pseudo, element, () => show(element, name));
    // A crumb the pointer was on goes without a word, and its box with it.
    if (pointed) point(null);
    pointed = null;
    crumbs.replaceChildren(...nodes);
    // The element is the end of the line, so that is the end that shows.
    crumbs.scrollLeft = crumbs.scrollWidth;
  }

  /** Bring a block into sight and light it for a moment. */
  function flash(id: number): void {
    const block = byId.get(id);
    if (!block || block.hidden) return;
    clearTimeout(flashTimer);
    lit?.classList.remove("flash");
    block.scrollIntoView({ block: "nearest" });
    // Read the layout, so a second flash of the same block starts over.
    void block.offsetWidth;
    block.classList.add("flash");
    lit = block;
    flashTimer = window.setTimeout(() => block.classList.remove("flash"), FLASH);
  }

  /** A color's swatch, which stands before what names the color. */
  function swatchNode(color: string): HTMLElement {
    const swatch = el("span", "css-swatch");
    swatch.setAttribute("aria-hidden", "true");
    swatch.style.backgroundColor = color;
    return swatch;
  }

  /** Where a custom property is set, by the inspection shown, found once for each name. */
  function sourceOfVariable(name: string): string | null {
    if (!read) return null;
    let source = sources.get(name);
    if (source === undefined) {
      source = declaredIn(read.found, name);
      sources.set(name, source);
    }
    return source;
  }

  /**
   * What a custom property's tooltip shows: what the element sees for it as
   * the tooltip comes up, not as it was when the styles were read, with a
   * swatch before a color, and under it, quietly, the selector that sets it.
   */
  function variableSaid(name: string, fallback: string | null): Node {
    const element = target;
    const seen = (one: string): string => (element ? page.variable(element, pseudo, one) : "");
    const said = variableTip({ name, fallback }, seen, sourceOfVariable(name), page.isColor);
    const box = el("span", "tip-lines");
    said.lines.forEach((text, index) => {
      const row = el("span", "tip-line");
      if (index === 0 && said.color) row.append(swatchNode(said.color));
      row.append(text);
      box.append(row);
    });
    if (said.source !== null) box.append(el("span", "tip-line tip-quiet", said.source));
    return box;
  }

  /**
   * A custom property's name, in a value or at the start of its own
   * declaration: a stop for the tab key that says what the element sees for
   * it, on rest and on focus.
   */
  function variable(name: string, fallback: string | null, className = "css-var"): HTMLButtonElement {
    const control = button(className, name);
    tip(control, () => variableSaid(name, fallback));
    return control;
  }

  /** A mark of the css between a name and a value, as quiet as a label. */
  function mark(text: string): HTMLElement {
    return el("span", "css-punct", text);
  }

  /** The start of a declaration's line: its name, and a swatch where its value is a color. */
  function named(
    row: HTMLElement,
    declaration: StyleDeclaration,
    variables: Inspection["variables"],
  ): void {
    const { name } = declaration;
    row.append(
      name.startsWith("--") ? variable(name, null, "css-name css-var") : el("span", "css-name", name),
      mark(": "),
    );
    const color = swatchOf(declaration, variables, page.isColor);
    if (color) row.append(swatchNode(color));
  }

  /**
   * A declaration's value, each custom property it reads a piece of its own.
   * With `variables`, a click on one a declaration in force reads goes to
   * the block that sets it.
   */
  function valueNode(declaration: StyleDeclaration, variables?: Inspection["variables"]): HTMLElement {
    const value = el("span", "css-value");
    for (const part of valueParts(declaration.value)) {
      if (part.kind !== "var") {
        value.append(part.text);
        continue;
      }
      const control = variable(part.text, part.fallback ?? null);
      const definedIn = variables?.[part.text]?.definedIn ?? null;
      if (definedIn !== null) control.addEventListener("click", () => flash(definedIn));
      value.append(control);
    }
    return value;
  }

  function line(
    declaration: StyleDeclaration,
    variables: Inspection["variables"],
    place: Place | null = null,
    off: Off | null = null,
  ): Line {
    // Struck through, as a declaration another one overrides is no longer in force.
    const row = el(declaration.overridden ? "s" : "div", "css-decl");
    named(row, declaration, variables);
    const value = valueNode(declaration, variables);
    row.append(value);
    if (declaration.important) row.append(" !important");
    row.append(mark(";"));
    if (place) editor?.editable(row, value, declaration, place, off);
    return { node: row, declaration };
  }

  /** The lines of a block, with those an edit turned off where they stood. */
  function blockLines(block: OwnBlock, variables: Inspection["variables"], place: Place | null): Line[] {
    const lines = block.declarations.map((declaration) => line(declaration, variables, place));
    if (!place || !editor) return lines;
    for (const off of editor.offs(place)) {
      const at = off.index < 0 ? lines.length : Math.min(off.index, lines.length);
      lines.splice(at, 0, line(offDeclaration(off), variables, place, off));
    }
    return lines;
  }

  function blockNode(block: OwnBlock, found: Inspection, group: HTMLElement | null, owner: Element): Built {
    const section = el("section", "css-block");
    section.setAttribute("role", "region");
    const head = el("div", "css-head");
    const selector = el("span", "css-selector");
    if (block.kind === "inline") {
      section.setAttribute("aria-label", "element.style");
      selector.textContent = "element.style";
      head.append(selector);
    } else {
      section.setAttribute("aria-label", block.selectorText);
      for (const context of block.context) section.append(el("div", "css-context", context));
      block.selector.forEach((part, index) => {
        if (index > 0) selector.append(", ");
        selector.append(el("span", part.matches ? "css-part" : "css-part off", part.text));
      });
      // The mark and the file keep together, as one end of the line.
      const from = el("span", "css-from");
      if (block.conditional && !block.conditional.confirmed) {
        const { kind } = block.conditional;
        const mark = el("span", "css-mark", kind);
        tip(mark, `could not tell whether its @${kind} holds for the element`);
        from.append(mark);
      }
      const source = sourceOf(block.origin);
      const file = el("span", "css-source", source.text);
      tip(file, source.tip);
      from.append(file);
      head.append(selector, from);
    }
    section.append(head);
    const place = editor?.placeOf(block, owner) ?? null;
    const lines = blockLines(block, found.variables, place);
    section.append(...lines.map((one) => one.node));
    if (place && editor) section.append(editor.addLine(place));
    byId.set(block.id, section);
    return { node: section, lines, group, blank: block.id === BLANK };
  }

  /** The blocks in the engine's order, a heading before each group of them. */
  function drawBlocks(found: Inspection, element: Element): void {
    dropTips();
    built = [];
    editor?.begin();
    byId = new Map();
    const nodes: HTMLElement[] = [];
    const add = (block: OwnBlock, group: HTMLElement | null, owner = element) => {
      const made = blockNode(block, found, group, owner);
      built.push(made);
      nodes.push(made.node);
    };
    let placed = false;
    // The new rules and the line that adds one come after the element's own rules.
    const placeNew = () => {
      if (placed || !editor || pseudo !== null) return;
      placed = true;
      const listed = new Set(found.blocks.flatMap((block) => (block.kind === "rule" ? [block.rule] : [])));
      newRules(element).forEach((rule, index) => {
        if (!listed.has(rule)) add(unmatched(rule, UNMATCHED - index), null);
      });
      nodes.push(editor.newRuleLine(element, newRuleSelector(element, statesHere())));
    };
    const each = (block: StyleBlock) => {
      if (block.kind === "inherited" || block.kind === "pseudo") placeNew();
      if (block.kind === "inherited") {
        const from = block.element;
        const head = link("css-group", `inherited from ${crumbText(block.from)}`, () => show(from));
        nodes.push(head);
        for (const own of block.blocks) add(own, head, from);
      } else if (block.kind === "pseudo") {
        const name = block.pseudo;
        const head = link("css-group", name, () => show(element, name));
        nodes.push(head);
        for (const own of block.blocks) add(own, head);
      } else add(block, null);
    };
    // The element's own style comes first, empty too, so a property can be added to it.
    if (log && pseudo === null && styleOf(element) && !found.blocks.some((block) => block.kind === "inline")) {
      add({ kind: "inline", id: BLANK, declarations: [], element }, null);
    }
    found.blocks.forEach(each);
    placeNew();
    for (const hidden of found.hidden) nodes.push(readOnly(el("div", "css-hidden", hiddenLine(hidden))));
    blocks.replaceChildren(...nodes);
  }

  /**
   * A line of the simple mode: the declaration as written, with no word on
   * the cascade, and after a value that reads custom properties what it comes to.
   */
  function appliedLine(
    { declaration }: Applied,
    variables: Inspection["variables"],
    place: Place | null = null,
    off: Off | null = null,
  ): Line {
    const row = el(off ? "s" : "div", "css-decl");
    named(row, declaration, variables);
    const value = valueNode(declaration);
    row.append(value, mark(";"));
    const comes = off ? null : resolvedValue(declaration.value, variables);
    if (comes !== null) row.append(el("span", "css-comes", ` → ${comes}`));
    if (place) editor?.editable(row, value, declaration, place, off);
    return { node: row, declaration };
  }

  /** The new rules made for the element that are in force. */
  function newRules(element: Element): CSSStyleRule[] {
    return log ? newRulesFor(log.recorded(), element) : [];
  }

  /** Where a hidden stylesheet is named: why none of its rules can be edited. */
  function readOnly(line: HTMLElement): HTMLElement {
    if (log) tip(line, READ_ONLY);
    return line;
  }

  /** What applies to the element as one list by group, then what it inherits, folded. */
  function drawApplied(found: Inspection, element: Element): void {
    dropTips();
    built = [];
    editor?.begin();
    byId = new Map();
    /** Where each line's edits go, and the lines an edit turned off, by their declaration. */
    const places = new Map<StyleDeclaration, Place | null>();
    const offs = new Map<StyleDeclaration, Off>();
    // The new rules show as blocks of their own, under the list.
    const mine = new Set<CSSStyleRule | CSSNestedDeclarations>(editor && pseudo === null ? newRules(element) : []);
    const applied = appliedOwn(found).filter((one) => one.block.kind !== "rule" || !mine.has(one.block.rule));
    for (const one of applied) places.set(one.declaration, editor?.placeOf(one.block, element) ?? null);
    // The element's own style, empty too, takes the properties added here.
    let inline: OwnBlock | undefined = found.blocks.find((block) => block.kind === "inline");
    if (log && pseudo === null && !inline && styleOf(element)) inline = { kind: "inline", id: BLANK, declarations: [], element };
    if (log) {
      const owned = found.blocks.filter((block): block is RuleBlock => block.kind === "rule" && !mine.has(block.rule));
      for (const block of inline ? [inline, ...owned] : owned) {
        const place = editor?.placeOf(block, element);
        if (!place || !editor) continue;
        for (const off of editor.offs(place)) {
          const declaration = offDeclaration(off);
          places.set(declaration, place);
          offs.set(declaration, off);
          applied.push({ declaration, block });
        }
      }
    }
    const addTo = inline && pseudo === null ? (editor?.placeOf(inline, element) ?? null) : null;
    const groups = grouped(applied);
    const own = groups.length > 0 || addTo ? el("div", "css-block css-applied") : emptyLine(NO_STYLES);
    const sets = groups.map(({ group, lines }): LineSet => {
      const set = el("div", "css-set");
      set.setAttribute("role", "group");
      set.setAttribute("aria-label", group);
      // One group alone needs no name.
      const name = groups.length > 1 ? el("div", "css-label", group) : null;
      if (name) name.setAttribute("aria-hidden", "true");
      const made = lines.map((one) =>
        appliedLine(one, found.variables, places.get(one.declaration) ?? null, offs.get(one.declaration) ?? null),
      );
      set.append(...(name ? [name] : []), ...made.map((one) => one.node));
      own.append(set);
      return { node: set, label: name, lines: made };
    });
    if (addTo && editor) own.append(editor.addLine(addTo));
    const nodes = [own];
    const rules: Built[] = [];
    if (editor && pseudo === null) {
      newRules(element).forEach((rule, index) => {
        const block = found.blocks.find((one): one is RuleBlock => one.kind === "rule" && one.rule === rule);
        const made = blockNode(block ?? unmatched(rule, UNMATCHED - index), found, null, element);
        rules.push(made);
        nodes.push(made.node);
      });
      nodes.push(editor.newRuleLine(element, newRuleSelector(element, statesHere())));
    }
    const handed = appliedInherited(found);
    flat = { own, sets, rules, inherited: null };
    if (handed.length > 0) {
      const fold = sectionFold({
        label: "inherited",
        open: unfolded,
        onToggle: (open) => {
          unfolded = open;
        },
      });
      const body = el("div", "css-applied");
      body.setAttribute("role", "group");
      body.setAttribute("aria-label", "inherited");
      const lines = handed.map((one) => appliedLine(one, found.variables));
      body.append(...lines.map((one) => one.node));
      fold.body.append(body);
      flat.inherited = { fold, lines };
      nodes.push(fold.node);
    }
    const hidden = hiddenNote(found.hidden);
    if (hidden !== null) nodes.push(readOnly(el("div", "css-hidden", hidden)));
    blocks.replaceChildren(...nodes);
  }

  /** Hide the lines the filter leaves out, the groups left with none, and a label left alone. */
  function filterApplied(view: Flat): void {
    const text = filter.node.value;
    const filtering = text.trim() !== "";
    const keeps = (lines: Line[]): boolean => {
      let kept = false;
      for (const one of lines) {
        const matches = matchesFilter(one.declaration, text);
        one.node.hidden = !matches;
        if (matches) kept = true;
      }
      return kept;
    };
    let shown = 0;
    for (const set of view.sets) {
      const kept = keeps(set.lines);
      set.node.hidden = !kept;
      if (kept) shown += 1;
    }
    for (const set of view.sets) if (set.label) set.label.hidden = shown < 2;
    // The line that says the element sets nothing is no answer to a filter.
    view.own.hidden = view.sets.length === 0 ? filtering : shown === 0;
    let ruled = false;
    for (const block of view.rules) {
      const kept = keeps(block.lines) || !filtering;
      block.node.hidden = !kept;
      if (kept) ruled = true;
    }
    const inherited = view.inherited;
    const handed = inherited ? keeps(inherited.lines) : false;
    if (inherited) inherited.fold.node.hidden = !handed;
    say(filtering && shown === 0 && !handed && !ruled ? NO_MATCH : null);
  }

  /** Hide the declarations the filter leaves out, and the blocks and headings left with none. */
  function applyFilter(): void {
    if (flat) {
      filterApplied(flat);
      return;
    }
    const text = filter.node.value;
    const filtering = text.trim() !== "";
    const groups = new Map<HTMLElement, boolean>();
    let any = false;
    for (const block of built) {
      if (block.blank && block.lines.length === 0) {
        block.node.hidden = filtering;
        continue;
      }
      let kept = !filtering;
      for (const one of block.lines) {
        const matches = matchesFilter(one.declaration, text);
        one.node.hidden = !matches;
        if (matches) kept = true;
      }
      block.node.hidden = !kept;
      if (kept) any = true;
      if (block.group) groups.set(block.group, (groups.get(block.group) ?? false) || kept);
    }
    for (const [head, kept] of groups) head.hidden = !kept;
    const drawn = built.filter((block) => !block.blank || block.lines.length > 0);
    say(any ? null : drawn.length === 0 ? NO_RULES : NO_MATCH);
  }

  /** Read the element's styles and build the view from them, once. */
  function refresh(): void {
    clearTimeout(timer);
    timer = 0;
    const element = target;
    if (!element) return;
    // A field being typed in stays: the styles are read again once it closes.
    if (editor?.busy()) {
      waiting = true;
      return;
    }
    if (stale) {
      stale = false;
      page.invalidate();
    }
    if (!element.isConnected || !element.ownerDocument.defaultView) {
      unforce(element);
      target = null;
      unwatch();
      point(null);
      context.held?.(null);
      clear(GONE, GONE_PICK);
      return;
    }
    // The copies of the rules a forced state needs, as the stylesheets are now.
    if (force.on()) force.sync();
    const found = page.inspect(element, pseudo ?? undefined);
    if (pseudo === null) {
      pseudos = found.blocks.flatMap((block) => (block.kind === "pseudo" ? [block.pseudo] : []));
    }
    crumbs.hidden = false;
    bar.hidden = false;
    drawChips();
    context.title(middle(`${found.target.label}${found.target.pseudo ?? ""}`, TITLE_MAX));
    drawCrumbs(element);
    drawBox();
    read = { found, element };
    sources = new Map();
    draw();
  }

  /** Build what the engine last said in the mode that is on, with no other read of the page. */
  function draw(): void {
    if (!read) return;
    flat = null;
    if (mode === "simple") drawApplied(read.found, read.element);
    else drawBlocks(read.found, read.element);
    applyFilter();
  }

  /** Show the other mode, and keep it as the one the view starts in. */
  function setMode(value: string): void {
    const next = MODES.find((one) => one === value);
    if (!next || next === mode) return;
    mode = next;
    context.mode?.set(next);
    modes?.set(next);
    // The other mode is another list, and starts from its top.
    const body = node.closest(".view-body");
    if (body) body.scrollTop = 0;
    draw();
  }

  function show(element: Element | null, name?: string): void {
    waiting = false;
    editor?.close(false);
    if (element !== target) {
      pseudos = [];
      unforce(target);
    }
    target = element;
    pseudo = name ?? null;
    if (pseudo !== null && !pseudos.includes(pseudo)) pseudos = [...pseudos, pseudo];
    point(null);
    context.held?.(element);
    if (!element) {
      unwatch();
      context.title("styles");
      clear(EMPTY, PICK);
      return;
    }
    watch(element);
    // The view's body scrolls, and a new element starts from its top.
    const body = node.closest(".view-body");
    if (body) body.scrollTop = 0;
    refresh();
  }

  /** A knob the page's styles can depend on moved: the scheme rewrites its stylesheets. */
  const unsubscribe = page.subscribe((state) => {
    const next = knobsOf(state);
    if (next === knobs) return;
    knobs = next;
    stale = true;
    if (target) later();
  });

  /** An edit was made, undone or done again: its line shows it at once. */
  const unlog = log?.subscribe(() => {
    if (target) refresh();
  });

  clear(EMPTY, PICK);

  return {
    node,
    show,
    refresh,
    escape(): boolean {
      return editor?.dismiss() || editor?.close(false) || filter.clear();
    },
    focus: () => node.focus({ preventScroll: true }),
    destroy(): void {
      waiting = false;
      unforce(target);
      editor?.destroy();
      unlog?.();
      clearTimeout(timer);
      clearTimeout(flashTimer);
      unwatch();
      unsubscribe();
      unpick?.();
      fitter?.disconnect();
      point(null);
      context.area?.(null);
      crumbs.removeEventListener("keydown", onCrumbKey);
      dropTips();
      target = null;
    },
  };
}
