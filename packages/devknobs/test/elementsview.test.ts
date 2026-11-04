import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { DEFAULT_STATE } from "../src/engine/store";
import type { DomTree, DomTreeContext } from "../src/ui/domtree";
import { attrEdit, htmlEdit } from "../src/edit/html";
import { type Change, createEditLog, type EditLog } from "../src/edit/log";
import type { Keeper } from "../src/edit/keep";
import { createDollar, createElementsView, DOLLAR, KEEP_LABEL, undoKey } from "../src/ui/elementsview";
import type { StylesPage, StylesView } from "../src/ui/stylesview";
import type { Tips } from "../src/ui/tooltip";
import { as as pageNode, elem, page as pageOf } from "./dom-page";
import { as, element, type FakeElement, FakeNode, FakeObserver, fake, pageDocument } from "./styles-dom";

function must(change: Change | null): Change {
  if (!change) throw new Error("no change");
  return change;
}

/** A window of the page, as far as `$0` goes on it. */
function windowOf(): Window {
  return new EventTarget() as unknown as Window;
}

/** A node of a page whose window is `view`. */
function nodeOn(view: Window | null): Node {
  return { ownerDocument: { defaultView: view } } as unknown as Node;
}

describe("$0", () => {
  test("is the node selected on its page's window, and goes when let go", () => {
    const view = windowOf();
    const dollar = createDollar();
    const one = nodeOn(view);
    const two = nodeOn(view);
    dollar.set(one);
    expect(Reflect.get(view, DOLLAR)).toBe(one);
    expect(Object.keys(view)).not.toContain(DOLLAR);
    dollar.set(two);
    expect(Reflect.get(view, DOLLAR)).toBe(two);
    dollar.release();
    expect(DOLLAR in view).toBe(false);
  });

  test("a page's own $0 is never touched, set before or after", () => {
    const view = windowOf();
    Reflect.set(view, DOLLAR, "theirs");
    const dollar = createDollar();
    dollar.set(nodeOn(view));
    expect(Reflect.get(view, DOLLAR)).toBe("theirs");
    dollar.release();
    expect(Reflect.get(view, DOLLAR)).toBe("theirs");

    const other = windowOf();
    const later = createDollar();
    later.set(nodeOn(other));
    Reflect.set(other, DOLLAR, "theirs");
    later.set(nodeOn(other));
    expect(Reflect.get(other, DOLLAR)).toBe("theirs");
    later.release();
    expect(Reflect.get(other, DOLLAR)).toBe("theirs");
  });

  test("moves to the frame's window with the node, and leaves the one before", () => {
    const top = windowOf();
    const frame = windowOf();
    const dollar = createDollar();
    dollar.set(nodeOn(top));
    const framed = nodeOn(frame);
    dollar.set(framed);
    expect(DOLLAR in top).toBe(false);
    expect(Reflect.get(frame, DOLLAR)).toBe(framed);
    dollar.set(null);
    expect(DOLLAR in frame).toBe(false);
  });
});

describe("the elements view", () => {
  let view: StylesView | null = null;
  let revealed: (Node | null)[];
  /** The nodes the view selected in the tree, apart from those it revealed. */
  let selects: Node[] = [];
  let tree: DomTreeContext | null;
  let asked: Element[];
  let app: FakeElement & { nodeType: number };
  let paneBody: FakeNode;
  let destroyed: number;

  const page: StylesPage = {
    inspect: (target) => {
      asked.push(target);
      return { target: { label: "div#app", pseudo: null }, blocks: [], hidden: [], variables: {}, skipped: 0 };
    },
    invalidate: () => undefined,
    getState: () => DEFAULT_STATE,
    subscribe: () => () => undefined,
    isColor: () => false,
    box: () => null,
    variable: () => "",
  };

  const tips: Tips = {
    show: () => undefined,
    hide: () => false,
    hideAfter: () => undefined,
    isFor: () => false,
    tooltip: () => undefined,
    destroy: () => undefined,
  };

  const GLOBALS = ["window", "document", "MutationObserver"] as const;
  const saved = GLOBALS.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));

  beforeEach(() => {
    jest.useFakeTimers();
    revealed = [];
    destroyed = 0;
    asked = [];
    tree = null;
    FakeObserver.made = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(new EventTarget(), { setTimeout: (run: () => void, delay: number) => setTimeout(run, delay) }),
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (tag: string) => new FakeNode(tag),
        createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
      },
    });
    Object.defineProperty(globalThis, "MutationObserver", { configurable: true, value: FakeObserver });
    const doc = pageDocument();
    app = Object.assign(element(doc, "div", { id: "app" }), { nodeType: 1 });
  });

  afterEach(() => {
    view?.destroy();
    view = null;
    jest.useRealTimers();
    GLOBALS.forEach((name, index) => {
      const descriptor = saved[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  });

  /** The log the view's keys undo and redo in. */
  let undid: string[] = [];
  const log: EditLog = {
    ...createEditLog(),
    undo: () => {
      undid.push("undo");
      return null;
    },
    redo: () => {
      undid.push("redo");
      return null;
    },
  };

  /** What the tree copied, and whether the clipboard takes it. */
  let copies: string[] = [];
  let copyWorks = true;

  /** The node the stub tree has selected. */
  let picked: Node | null = null;

  function start(keep: Keeper | null = null): FakeNode {
    undid = [];
    copies = [];
    copyWorks = true;
    const stub: DomTree = {
      node: new FakeNode("div") as unknown as HTMLElement,
      reveal: (node) => revealed.push(node),
      select: (node) => selects.push(node),
      selected: () => picked,
      escape: () => false,
      destroy: () => {
        destroyed++;
      },
    };
    view = createElementsView(
      { tips, title: () => undefined, outline: () => undefined },
      {
        page,
        edits: log,
        keep,
        copy: (text) => {
          copies.push(text);
          return copyWorks ? true : Promise.reject(new Error("no clipboard"));
        },
        tree: (context) => {
          tree = context;
          return stub;
        },
      },
    );
    paneBody = new FakeNode("div");
    paneBody.className = "view-body";
    paneBody.append(fake(view.node));
    return fake(view.node);
  }

  test("selects the node an edit put in place of the one selected, and nothing for a node still on the page", () => {
    picked = null;
    start();
    const old = elem("div", { class: "block" });
    const body = elem("body", {}, old);
    pageOf(() => [body]);
    const made = elem("section");
    picked = pageNode(old);
    revealed = [];
    selects = [];
    log.record(must(htmlEdit({ selector: "div.block" }, pageNode(old) as Element, "<div></div>", [pageNode(made)])));
    expect(selects).toEqual([pageNode(made)]);
    picked = pageNode(made);
    log.record(must(attrEdit({ selector: "section" }, pageNode(made) as Element, "id", "x")));
    expect(selects).toEqual([pageNode(made)]);
    expect(revealed).toEqual([]);
    log.undoAll();
    picked = null;
  });

  test("has the switch that keeps the edits after a reload at its top, as the keeper has it, only with a keeper", () => {
    expect(start().all().some((one) => one.classList.contains("keep-line"))).toBe(false);
    view?.destroy();
    let on = false;
    const listeners = new Set<() => void>();
    const turned: boolean[] = [];
    const keep: Keeper = {
      on: () => on,
      set: (next) => void turned.push(next),
      restored: () => null,
      cut: () => 0,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      stop: () => undefined,
    };
    const node = start(keep);
    const line = node.all().find((one) => one.classList.contains("keep-line"));
    expect(node.all().findIndex((one) => one === line)).toBe(1);
    expect(line?.classList.contains("keep-line")).toBe(true);
    expect(line?.textContent).toBe(KEEP_LABEL);
    const control = line?.all().find((one) => one.tag === "button");
    expect(control?.getAttribute("aria-checked")).toBe("false");
    control?.fire("click");
    expect(turned).toEqual([true]);
    on = false;
    for (const listener of listeners) listener();
    expect(control?.getAttribute("aria-checked")).toBe("false");
    on = true;
    for (const listener of listeners) listener();
    expect(control?.getAttribute("aria-checked")).toBe("true");
  });

  test("undoes on Z and redoes on ⇧Z, and leaves a key in a field to it", () => {
    const node = start();
    const div = { tagName: "DIV" };
    const z = node.fire("keydown", { key: "z", target: div });
    node.fire("keydown", { key: "Z", shiftKey: true, target: div });
    node.fire("keydown", { key: "z", target: { tagName: "INPUT" } });
    node.fire("keydown", { key: "я", code: "KeyZ", target: div });
    expect(undid).toEqual(["undo", "redo", "undo"]);
    expect(z.prevented).toBe(true);
  });

  test("copies from the tree at once, and a copy that fails throws nothing", async () => {
    start();
    copyWorks = false;
    tree?.copy("<div></div>");
    expect(copies).toEqual(["<div></div>"]);
    await Promise.resolve();
    await Promise.resolve();
  });

  test("is the tree over the styles, the crumbs first under it", () => {
    const node = start();
    expect(node.className).toBe("elements");
    expect(node.children.map((child) => (typeof child === "string" ? child : child.className))).toEqual(["", "styles", "changes"]);
    const styles = node.children[1] as FakeNode;
    expect((styles.children[0] as FakeNode).className).toBe("crumbs");
  });

  test("an element shown is revealed in the tree, and is $0 until the view goes", () => {
    start();
    view?.show(as(app));
    expect(revealed).toEqual([as(app)]);
    expect(Reflect.get(app.ownerDocument.defaultView as object, DOLLAR)).toBe(as(app));
    view?.show(null);
    expect(revealed).toEqual([as(app), null]);
    view?.show(as(app));
    view?.destroy();
    view = null;
    expect(destroyed).toBe(1);
    expect(DOLLAR in (app.ownerDocument.defaultView as object)).toBe(false);
  });

  test("a new element starts the view's body from its top, not the tree over the styles", () => {
    const node = start();
    paneBody.scrollTop = 80;
    node.scrollTop = 40;
    view?.show(as(app));
    expect(paneBody.scrollTop).toBe(0);
    expect(node.scrollTop).toBe(40);
  });

  test("a line selected in the tree shows its element's styles and is $0, and is not revealed again", () => {
    start();
    const words = { nodeType: 3, parentNode: app, ownerDocument: app.ownerDocument } as unknown as Node;
    tree?.select(words, null);
    expect(asked).toEqual([as(app)]);
    expect(revealed).toEqual([]);
    expect(Reflect.get(app.ownerDocument.defaultView as object, DOLLAR)).toBe(words);
    view?.destroy();
    view = null;
    expect(DOLLAR in (app.ownerDocument.defaultView as object)).toBe(false);
  });
});

describe("the undo keys", () => {
  /** A keydown, on a node with a tag. */
  function key(key: string, more: Partial<KeyboardEvent> = {}, tag = "DIV"): KeyboardEvent {
    const target = { tagName: tag };
    return { key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, target, composedPath: () => [target], ...more } as unknown as KeyboardEvent;
  }

  test("are z and shift z, with no other modifier and not in a field", () => {
    expect(undoKey(key("z"))).toBe("undo");
    expect(undoKey(key("Z", { shiftKey: true }))).toBe("redo");
    expect(undoKey(key("z", { metaKey: true }))).toBeNull();
    expect(undoKey(key("z", { ctrlKey: true }))).toBeNull();
    expect(undoKey(key("z", { altKey: true }))).toBeNull();
    expect(undoKey(key("z", {}, "INPUT"))).toBeNull();
    expect(undoKey(key("y"))).toBeNull();
    expect(undoKey(key("я", { code: "KeyZ" }))).toBe("undo");
  });
});
