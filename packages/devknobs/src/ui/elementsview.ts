/**
 * Inspect's view as the browsers' Elements panel lays it out: the DOM tree on
 * top, and under it the styles view, its crumbs first, as the breadcrumb bar
 * under the tree. The two follow each other: a line selected in the tree
 * shows its element's styles, and an element the styles show, a pick on the
 * page or a crumb, is revealed in the tree. The node selected is `$0` on its
 * page's window while the view is up, as in the browser's console, unless the
 * page has a `$0` of its own. The styles can be edited, and the edits are
 * listed at the foot, with Z to undo and ⇧Z to redo while the focus is
 * in the view and not in a field. To use it, as the styles view:
 *
 *   const view = createElementsView(context);
 *   body.append(view.node); view.show(element); view.destroy();
 */

import { type EditLog, edits } from "../edit/log";
import { type Copy, createChanges } from "./changes";
import { copyText } from "./copytext";
import { el } from "./dom";
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
}

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
    copy: (text) => void copy(text),
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
  const changes = createChanges(log, copy);
  node.append(tree.node, styles.node, changes.node);

  function onKeydown(event: KeyboardEvent): void {
    const key = undoKey(event);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "undo") log.undo();
    else log.redo();
  }

  node.addEventListener("keydown", onKeydown);

  return {
    node,
    show: (element, pseudo) => styles.show(element, pseudo),
    refresh: () => styles.refresh(),
    escape: () => styles.escape(),
    focus: () => styles.focus(),
    destroy(): void {
      node.removeEventListener("keydown", onKeydown);
      tree.destroy();
      styles.destroy();
      changes.destroy();
      dollar.release();
    },
  };
}
