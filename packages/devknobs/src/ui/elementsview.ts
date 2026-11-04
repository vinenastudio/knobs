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
 * back in its place is selected. A switch at the top keeps the edits after a
 * reload, as `edit/keep.ts` says. To use it, as the styles view:
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
import { switchLine } from "./kit";
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
  /** What keeps the edits after a reload. Defaults to the page's one; without one the view has no switch. */
  keep?: Keeper | null;
}

/** What the switch at the top of the view says. */
export const KEEP_LABEL = "keep edits after reload";

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
    editor: (hooks) => createDomEditor(hooks, { log, locate: context.locate }),
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
  const changes = createChanges(log, copy, undefined, keep);
  const keepSwitch = keep ? switchLine({ label: KEEP_LABEL, on: keep.on(), onChange: (on) => keep.set(on) }) : null;
  keepSwitch?.node.classList.add("keep-line");
  const stopKeep = keep && keepSwitch ? keep.subscribe(() => keepSwitch.set(keep.on())) : null;
  if (keepSwitch) node.append(keepSwitch.node);
  node.append(tree.node, styles.node, changes.node);

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
      stopFollow();
      stopKeep?.();
      tree.destroy();
      styles.destroy();
      changes.destroy();
      dollar.release();
    },
  };
}
