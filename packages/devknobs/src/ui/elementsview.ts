/**
 * Inspect's view as the browsers' Elements panel lays it out: the DOM tree on
 * top, and under it the styles view, its crumbs first, as the breadcrumb bar
 * under the tree. The two follow each other: a line selected in the tree
 * shows its element's styles, and an element the styles show, a pick on the
 * page or a crumb, is revealed in the tree. The node selected is `$0` on its
 * page's window while the view is up, as in the browser's console, unless the
 * page has a `$0` of its own. The styles and the tree's html can be edited,
 * and the edits are listed at the foot, with Z to undo and ⇧Z to redo while
 * the focus is in the view and not in a field. Where an undo takes away the
 * node selected, as one of an element written anew as html, the node put
 * back in its place is selected. A switch in the settings keeps the edits
 * after a reload, as `edit/keep.ts` says. To use it, as the styles view:
 *
 *   const view = createElementsView(context);
 *   body.append(view.node); view.show(element); view.destroy();
 */

import { successor } from "../edit/html";
import { type Keeper, keeper } from "../edit/keep";
import { type EditLog, edits } from "../edit/log";
import { type Copy, createChanges } from "./changes";
import { copyText } from "./copytext";
import { el } from "./dom";
import { createDomEditor } from "./domedit";
import { createDomTree, type DomTree, elementOf } from "./domtree";
import { letterMatches, typesInField } from "./keys";
import { createStylesView, type StylesContext, type StylesPage, type StylesView } from "./stylesview";

/** The name the console knows the node selected in the Elements panel by. */
export const DOLLAR = "$0";

/** What the view needs beyond the styles view's context, so a test can stand in for it. */
export interface ElementsParts {
  page?: StylesPage;
  tree?: (context: Parameters<typeof createDomTree>[0]) => DomTree;
  /** Copies a text, and says whether it went. */
  copy?: Copy;
  /** The log the edits go to. Defaults to the page's one. */
  edits?: EditLog;
  /** What keeps the edits after a reload. Defaults to the page's one. */
  keep?: Keeper | null;
}

/** The least height the DOM tree is dragged to, as its css has it. */
const TREE_MIN = 96;

/** Whether a keydown is the view's undo, z, or its redo, shift z: no other modifier, and not in a field. */
export function undoKey(event: KeyboardEvent): "undo" | "redo" | null {
  if (!letterMatches(event, "z") || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.isComposing || typesInField(event)) return null;
  return event.shiftKey ? "redo" : "undo";
}

/**
 * Sets `$0` on a window while a node is selected, and takes it away after.
 * A window that already has a `$0` keeps it, and one the page set over ours
 * since is left alone.
 */
export function createDollar(): { set(node: Node | null): void; release(): void } {
  let held: { view: Window; node: Node } | null = null;

  function release(): void {
    if (!held) return;
    const { view, node } = held;
    held = null;
    try {
      if (Reflect.get(view, DOLLAR) === node) Reflect.deleteProperty(view, DOLLAR);
    } catch {
      // A window that went has nothing to take back.
    }
  }

  function set(node: Node | null): void {
    const view = node?.ownerDocument?.defaultView ?? null;
    if (held && held.view !== view) release();
    if (!node || !view) return;
    try {
      if (held) {
        if (Reflect.get(view, DOLLAR) !== held.node) return;
        Reflect.set(view, DOLLAR, node);
        held = { view, node };
        return;
      }
      if (DOLLAR in view) return;
      Object.defineProperty(view, DOLLAR, { value: node, writable: true, configurable: true, enumerable: false });
      held = { view, node };
    } catch {
      // A window that will not take it.
    }
  }

  return { set, release };
}

export function createElementsView(context: StylesContext, parts: ElementsParts = {}): StylesView {
  const node = el("div", "elements");
  const dollar = createDollar();
  /** The styles are shown from the tree, and need not be revealed in it again. */
  let fromTree = false;
  const copy: Copy = parts.copy ?? copyText;
  const log = parts.edits ?? edits;
  const tree = (parts.tree ?? createDomTree)({
    outline: (element) => context.outline(element),
    select(picked, pseudo) {
      dollar.set(picked);
      fromTree = true;
      try {
        styles.show(elementOf(picked), pseudo ?? undefined);
      } finally {
        fromTree = false;
      }
    },
    // Called at once, inside the click, and a copy that fails says nothing here.
    copy: (text) => {
      void Promise.resolve(copy(text)).catch(() => undefined);
    },
    editor: (hooks) => createDomEditor(hooks, { log, locate: context.locate, ...(context.htmlSize && { htmlSize: context.htmlSize }) }),
  });
  const styles: StylesView = createStylesView(
    {
      ...context,
      edits: log,
      held(element) {
        context.held?.(element);
        if (fromTree) return;
        tree.reveal(element);
        dollar.set(element);
      },
    },
    parts.page,
  );
  const keep = parts.keep === undefined ? keeper() : parts.keep;
  const changes = createChanges(log, copy, undefined, keep, context.diff ?? null);
  const split = el("div", "dom-split");
  split.setAttribute("role", "separator");
  split.setAttribute("aria-orientation", "horizontal");
  split.setAttribute("aria-label", "drag to resize the DOM tree");
  split.setAttribute("aria-valuemin", String(TREE_MIN));
  split.tabIndex = 0;
  node.append(tree.node, split, styles.node, changes.node);

  /** The tallest the tree goes: 85% of its window's height. */
  function tallest(): number {
    const view = tree.node.ownerDocument?.defaultView ?? window;
    return Math.max(TREE_MIN, Math.round(view.innerHeight * 0.85));
  }

  /** Tells the separator's range and the tree's height now. */
  function tell(most: number, now: number): void {
    split.setAttribute("aria-valuemax", String(most));
    split.setAttribute("aria-valuenow", String(now));
  }

  /** Tells the tree's height as laid out, before any resize. */
  function measure(): void {
    tell(tallest(), Math.round(tree.node.offsetHeight));
  }

  /** Sets the tree's height, kept between its least and 85% of its window's height. */
  function size(height: number): void {
    const most = tallest();
    const next = Math.round(Math.min(most, Math.max(TREE_MIN, height)));
    tree.node.style.height = `${next}px`;
    tell(most, next);
  }

  const frameView = tree.node.ownerDocument?.defaultView ?? window;
  const firstFrame = frameView.requestAnimationFrame?.(measure);

  /** The drag going on, to take its listeners off when the view goes mid drag. */
  let stopDrag: (() => void) | null = null;

  function onSplitDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    stopDrag?.();
    event.preventDefault();
    const id = event.pointerId;
    const from = event.clientY;
    const was = tree.node.offsetHeight;
    split.setPointerCapture?.(id);
    split.setAttribute("data-drag", "true");
    const move = (next: PointerEvent): void => {
      if (next.pointerId === id) size(was + next.clientY - from);
    };
    const end = (next: PointerEvent): void => {
      if (next.pointerId === id) up();
    };
    const up = (): void => {
      split.removeEventListener("pointermove", move);
      split.removeEventListener("pointerup", end);
      split.removeEventListener("pointercancel", end);
      split.removeEventListener("lostpointercapture", end);
      split.removeAttribute("data-drag");
      stopDrag = null;
    };
    stopDrag = up;
    split.addEventListener("pointermove", move);
    split.addEventListener("pointerup", end);
    split.addEventListener("pointercancel", end);
    split.addEventListener("lostpointercapture", end);
  }

  function onSplitKey(event: KeyboardEvent): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 64 : 16;
    size(tree.node.offsetHeight + (event.key === "ArrowDown" ? step : -step));
  }

  split.addEventListener("pointerdown", onSplitDown);
  split.addEventListener("keydown", onSplitKey);
  split.addEventListener("focus", measure);

  function onKeydown(event: KeyboardEvent): void {
    const key = undoKey(event);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "undo") log.undo();
    else log.redo();
  }

  /** An undo or a redo took the node selected off the page: the one in its place is selected. */
  function follow(): void {
    const picked = tree.selected();
    if (!picked || picked.isConnected) return;
    const next = successor(picked);
    if (next) tree.select(next);
  }

  node.addEventListener("keydown", onKeydown);
  const stopFollow = log.subscribe(follow);

  return {
    node,
    show: (element, pseudo) => styles.show(element, pseudo),
    refresh: () => styles.refresh(),
    escape: () => tree.escape() || styles.escape(),
    focus: () => styles.focus(),
    destroy(): void {
      node.removeEventListener("keydown", onKeydown);
      stopDrag?.();
      split.removeEventListener("pointerdown", onSplitDown);
      split.removeEventListener("keydown", onSplitKey);
      split.removeEventListener("focus", measure);
      if (firstFrame !== undefined) frameView.cancelAnimationFrame?.(firstFrame);
      stopFollow();
      tree.destroy();
      styles.destroy();
      changes.destroy();
      dollar.release();
    },
  };
}
