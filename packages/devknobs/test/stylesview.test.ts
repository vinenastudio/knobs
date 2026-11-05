import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { DEFAULT_STATE } from "../src/engine/store";
import type {
  Inspection,
  RuleBlock,
  StyleBlock,
  StyleDeclaration,
} from "../src/styles/types";
import type { DevknobsState } from "../src/types";
import { createEditLog, type EditLog } from "../src/edit/log";
import { parseDeclarations } from "../src/styles/declarations";
import { ADD, HOLD, NEW_RULE } from "../src/ui/cssedit";
import { FORCED_STATES, type ForcedState } from "../src/styles/force";
import {
  createStylesView,
  EMPTY,
  GONE,
  NO_MATCH,
  NO_RULES,
  FORCE_LABEL,
  READ_ONLY,
  SETTLE,
  type StylesPage,
  type StylesView,
} from "../src/ui/stylesview";
import type { Tips } from "../src/ui/tooltip";
import {
  as,
  element,
  type FakeDocument,
  type FakeElement,
  FakeNode,
  FakeObserver,
  fake,
  pageDocument,
} from "./styles-dom";
import { Block, fakeCss } from "./edit-block";
import { PageDocument } from "./force-dom";
import { newRulesFor } from "../src/edit/rule";

function declaration(
  name: string,
  value: string,
  more: Partial<StyleDeclaration> = {},
): StyleDeclaration {
  return { name, value, important: false, longhands: [name], overridden: false, variables: [], ...more };
}

let ids = 0;

function rule(
  selector: string,
  declarations: StyleDeclaration[],
  more: Partial<RuleBlock> = {},
): RuleBlock {
  return {
    kind: "rule",
    id: ids++,
    selectorText: selector,
    selector: selector.split(", ").map((text) => ({ text, matches: true })),
    specificity: [0, 1, 0],
    origin: { sheet: "https://example.com/assets/app.css", owner: "link", path: [0] },
    context: [],
    declarations,
    rule: {} as CSSStyleRule,
    ...more,
  };
}

/** The page: html, body, div#app.shell, and in it the button the tests pick. */
let doc: FakeDocument;
let html: FakeElement;
let body: FakeElement;
let app: FakeElement;
let save: FakeElement;
let sheet: FakeElement;

/** What the engine is asked, and what it answers with next. */
let asked: { element: Element; pseudo: string | undefined }[];
let answer: (element: Element, pseudo?: string) => Inspection;
let invalidated: number;
/** What the view calls as it goes, in order, to tell an invalidate came before a read. */
let calls: string[];
let knobs: ((state: DevknobsState) => void)[];
let titles: string[];
let outlined: (Element | null)[];
/** What the view said it holds, in order. */
let held: (Element | null)[];
let tipped: [FakeNode, string][];
let view: StylesView | null = null;
/** The states forced, as the view sets and reads them, and what it asked of the forcing, in order. */
let forced: { element: Element; states: ForcedState[] } | null;
let forceCalls: string[];

function found(blocks: StyleBlock[], more: Partial<Inspection> = {}): Inspection {
  return {
    target: { label: "button#save.primary", pseudo: null },
    blocks,
    hidden: [],
    variables: {},
    skipped: 0,
    ...more,
  };
}

const page: StylesPage = {
  inspect: (target, pseudo) => {
    asked.push({ element: target, pseudo });
    calls.push("inspect");
    return answer(target, pseudo);
  },
  invalidate: () => {
    invalidated++;
    calls.push("invalidate");
  },
  getState: () => DEFAULT_STATE,
  subscribe: (listener) => {
    knobs.push(listener);
    return () => {
      knobs = knobs.filter((one) => one !== listener);
    };
  },
  isColor: (text) => /^#[0-9a-f]{3,8}$/i.test(text) || text === "red",
  box: () => null,
  variable: () => "",
  force: {
    state: () => forced,
    set: (element, states) => {
      const chosen = FORCED_STATES.filter((state) => states.includes(state));
      forced = element && chosen.length > 0 ? { element, states: chosen } : null;
      forceCalls.push(`set ${chosen.join(" ")}`);
      return chosen;
    },
    clear: () => {
      forced = null;
      forceCalls.push("clear");
    },
    sync: () => {
      forceCalls.push("sync");
    },
    on: () => forced !== null,
  },
};

const tips: Tips = {
  show: () => undefined,
  hide: () => false,
  hideAfter: () => undefined,
  isFor: () => false,
  tooltip: (node, text) => {
    const said = typeof text === "string" ? text : text();
    tipped.push([fake(node), typeof said === "string" ? said : fake(said).textContent]);
  },
  destroy: () => undefined,
};

/** The view, editable with a log. */
function start(edits?: EditLog): FakeNode {
  view = createStylesView(
    {
      tips,
      title: (text) => titles.push(text),
      outline: (target) => outlined.push(target),
      held: (target) => held.push(target),
      edits,
    },
    page,
  );
  // The pane's body, which scrolls, on the page.
  const paneBody = new FakeNode("div");
  paneBody.root = true;
  paneBody.append(fake(view.node));
  return fake(view.node);
}

/** The lines the view shows, block by block, as text. */
function lines(node: FakeNode): string[][] {
  return node.shown("css-block").map((block) => block.shown("css-decl").map((one) => one.textContent));
}

function note(node: FakeNode): string | null {
  const [one] = node.shown("empty");
  return one ? one.textContent : null;
}

function observer(): FakeObserver {
  const last = FakeObserver.made[FakeObserver.made.length - 1];
  if (!last) throw new Error("no observer");
  return last;
}

function wait(ms: number): void {
  jest.advanceTimersByTime(ms);
}

beforeEach(() => {
  jest.useFakeTimers();
  ids = 0;
  forced = null;
  forceCalls = [];
  doc = pageDocument();
  html = element(doc, "html");
  body = element(doc, "body", {}, html);
  app = element(doc, "div", { id: "app", class: "shell" }, body);
  save = element(doc, "button", { id: "save", class: "primary" }, app);
  sheet = element(doc, "style");
  asked = [];
  invalidated = 0;
  calls = [];
  knobs = [];
  titles = [];
  outlined = [];
  held = [];
  tipped = [];
  FakeObserver.made = [];
  answer = () => found([rule(".primary", [declaration("color", "red")])]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      setTimeout: (run: () => void, delay: number) => setTimeout(run, delay),
    }),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => new FakeNode(tag),
      createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
    },
  });
  Object.defineProperty(globalThis, "MutationObserver", { configurable: true, value: FakeObserver });
});

afterEach(() => {
  view?.destroy();
  view = null;
  jest.useRealTimers();
  for (const name of ["window", "document", "MutationObserver"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("the styles view before a pick", () => {
  test("says one calm line, and shows no crumbs, filter or block", () => {
    const node = start();
    expect(note(node)).toBe(EMPTY);
    expect(node.shown("toolbar")).toEqual([]);
    expect(node.find("css-block")).toEqual([]);
    expect(asked).toEqual([]);
  });
});

describe("the styles view of an element", () => {
  test("names the element in the pane's head, says it holds it, and draws nothing on the page", () => {
    start();
    view?.show(as(save));
    expect(titles).toEqual(["button#save.primary"]);
    expect(held).toEqual([as(save)]);
    expect(outlined).toEqual([]);
    expect(asked).toEqual([{ element: as(save), pseudo: undefined }]);
  });

  test("cuts a long name in its middle", () => {
    answer = () =>
      found([], { target: { label: `div.${"a".repeat(30)}.${"b".repeat(30)}`, pseudo: null } });
    start();
    view?.show(as(save));
    expect([...(titles[0] ?? "")]).toHaveLength(44);
    expect(titles[0]).toContain("…");
  });

  test("lists its ancestors as crumbs from the outermost in, the element last and current", () => {
    const node = start();
    view?.show(as(save));
    const crumbs = node.find("crumb");
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual([
      "html",
      "body",
      "div#app",
      "button#save",
    ]);
    expect(crumbs.map((crumb) => crumb.getAttribute("aria-current"))).toEqual([
      null,
      null,
      null,
      "true",
    ]);
    expect(crumbs.every((crumb) => crumb.tag === "button")).toBe(true);
  });

  test("a crumb boxes its element on the page while the pointer is on it, and only then", () => {
    const node = start();
    view?.show(as(save));
    const [, , third, last] = node.find("crumb");
    third?.fire("pointerenter");
    expect(outlined).toEqual([as(app)]);
    third?.fire("pointerleave");
    expect(outlined).toEqual([as(app), null]);
    last?.fire("pointerenter");
    last?.fire("pointerleave");
    expect(outlined).toEqual([as(app), null, as(save), null]);
  });

  test("a crumb that goes while the pointer is on it takes its box with it", () => {
    const node = start();
    view?.show(as(save));
    node.find("crumb")[2]?.fire("pointerenter");
    // The click shows the ancestor, and the crumbs are drawn again under the pointer.
    node.find("crumb")[2]?.fire("click");
    expect(outlined).toEqual([as(app), null]);
    view?.refresh();
    expect(outlined).toEqual([as(app), null]);
  });

  test("the view going takes off a box it had on the page, and takes none off where it had none", () => {
    start();
    view?.show(as(save));
    view?.destroy();
    expect(outlined).toEqual([]);
    const node = start();
    view?.show(as(save));
    node.find("crumb")[3]?.fire("pointerenter");
    view?.destroy();
    expect(outlined).toEqual([as(save), null]);
  });

  test("a click on a crumb inspects that ancestor, which the view then holds", () => {
    const node = start();
    view?.show(as(save));
    node.find("crumb")[2]?.fire("click");
    expect(asked[1]).toEqual({ element: as(app), pseudo: undefined });
    expect(held).toEqual([as(save), as(app)]);
    expect(outlined).toEqual([]);
    expect(node.find("crumb").map((crumb) => crumb.textContent)).toEqual([
      "html",
      "body",
      "div#app",
    ]);
  });

  test("the crumbs are one stop for the tab key, and the arrows walk them", () => {
    const node = start();
    view?.show(as(save));
    const crumbs = node.find("crumb");
    expect(crumbs.map((crumb) => crumb.tabIndex)).toEqual([-1, -1, -1, 0]);
    const event = crumbs[3]?.press("ArrowLeft");
    expect(event?.prevented).toBe(true);
    expect(crumbs.map((crumb) => crumb.tabIndex)).toEqual([-1, -1, 0, -1]);
    expect(crumbs[2]?.focused).toBe(true);
    // Past the first there is nowhere to go.
    crumbs[2]?.press("ArrowLeft");
    crumbs[1]?.press("ArrowLeft");
    expect(crumbs[0]?.press("ArrowLeft").prevented).toBe(false);
    expect(crumbs.map((crumb) => crumb.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  test("shows the blocks in the order the engine gives them", () => {
    answer = () =>
      found([
        { kind: "inline", id: 9, declarations: [declaration("top", "0")], element: as(save) },
        rule("#save", [declaration("color", "red")]),
        rule("button", [declaration("color", "blue", { overridden: true })]),
      ]);
    const node = start();
    view?.show(as(save));
    expect(lines(node)).toEqual([["top: 0;"], ["color: red;"], ["color: blue;"]]);
    expect(node.find("css-selector").map((one) => one.textContent)).toEqual([
      "element.style",
      "#save",
      "button",
    ]);
  });

  test("each block is a region named by its selector", () => {
    answer = () =>
      found([
        { kind: "inline", id: 9, declarations: [declaration("top", "0")], element: as(save) },
        rule(".primary, .ghost", [declaration("color", "red")]),
      ]);
    const node = start();
    view?.show(as(save));
    const blocks = node.find("css-block");
    expect(blocks.map((block) => block.getAttribute("role"))).toEqual(["region", "region"]);
    expect(blocks.map((block) => block.getAttribute("aria-label"))).toEqual([
      "element.style",
      ".primary, .ghost",
    ]);
  });

  test("mutes the selectors of a list that do not reach the element", () => {
    const block = rule(".primary, .ghost, button", [declaration("color", "red")]);
    block.selector = [
      { text: ".primary", matches: true },
      { text: ".ghost", matches: false },
      { text: "button", matches: true },
    ];
    answer = () => found([block]);
    const node = start();
    view?.show(as(save));
    expect(node.find("css-selector")[0]?.textContent).toBe(".primary, .ghost, button");
    expect(node.find("css-part").map((part) => [part.textContent, part.classList.contains("off")])).toEqual([
      [".primary", false],
      [".ghost", true],
      ["button", false],
    ]);
  });

  test("puts what a rule sits in above its selector, outermost first", () => {
    answer = () =>
      found([
        rule(".primary", [declaration("color", "red")], {
          context: ["@layer base", "@media (min-width: 640px)"],
        }),
      ]);
    const node = start();
    view?.show(as(save));
    const [block] = node.find("css-block");
    expect(block?.find("css-context").map((one) => one.textContent)).toEqual([
      "@layer base",
      "@media (min-width: 640px)",
    ]);
    const order = block?.children.map((child) => (typeof child === "string" ? "" : child.className));
    expect(order).toEqual(["css-context", "css-context", "css-head", "css-decl"]);
  });

  test("ends the selector's line with the stylesheet's file, its whole address in a tooltip", () => {
    const node = start();
    view?.show(as(save));
    const [source] = node.find("css-source");
    expect(source?.textContent).toBe("app.css");
    expect(tipped).toContainEqual([source as FakeNode, "https://example.com/assets/app.css"]);
    // The file is the end of the head's line, after the selector, so it can go under it.
    const [head] = node.find("css-head");
    expect(head?.children.map((child) => fake(child).className)).toEqual(["css-selector", "css-from"]);
    expect(node.find("css-from")[0]?.find("css-source")).toEqual([source as FakeNode]);
  });

  test("strikes an overridden declaration through, and says important", () => {
    answer = () =>
      found([
        rule(".primary", [
          declaration("color", "red", { important: true }),
          declaration("margin", "0 auto", { overridden: true }),
        ]),
      ]);
    const node = start();
    view?.show(as(save));
    const rows = node.find("css-decl");
    expect(rows.map((row) => row.textContent)).toEqual([
      "color: red !important;",
      "margin: 0 auto;",
    ]);
    expect(rows.map((row) => row.tag)).toEqual(["div", "s"]);
  });

  test("marks a container rule that could not be confirmed, and not one that was", () => {
    answer = () =>
      found([
        rule(".a", [declaration("color", "red")], {
          conditional: { kind: "container", confirmed: false },
        }),
        rule(".b", [declaration("color", "red")], {
          conditional: { kind: "container", confirmed: true },
        }),
      ]);
    const node = start();
    view?.show(as(save));
    const marks = node.find("css-mark");
    expect(marks.map((mark) => mark.textContent)).toEqual(["container"]);
    expect(node.find("css-block")[0]?.find("css-mark")).toHaveLength(1);
    expect(tipped).toContainEqual([
      marks[0] as FakeNode,
      "could not tell whether its @container holds for the element",
    ]);
  });

  test("puts a swatch before a value that is a color, and none before one that is not", () => {
    answer = () =>
      found([rule(".primary", [declaration("color", "#0af"), declaration("margin", "0 auto")])]);
    const node = start();
    view?.show(as(save));
    const [color, margin] = node.find("css-decl");
    const [swatch] = color?.find("css-swatch") ?? [];
    expect(swatch?.style.backgroundColor).toBe("#0af");
    expect(swatch?.getAttribute("aria-hidden")).toBe("true");
    // Before the value, after the name.
    const order = color?.children.map((child) => (typeof child === "string" ? child : child.className));
    expect(order).toEqual(["css-name", "css-punct", "css-swatch", "css-value", "css-punct"]);
    expect(margin?.find("css-swatch")).toEqual([]);
  });

  test("a custom property read in a value says what it resolves to, and has a swatch for a color", () => {
    answer = () =>
      found([rule(".primary", [declaration("color", "var(--brand)", { variables: ["--brand"] })])], {
        variables: { "--brand": { value: "#0af", definedIn: null } },
      });
    const node = start();
    view?.show(as(save));
    const [name] = node.find("css-var");
    expect(name?.textContent).toBe("--brand");
    expect(name?.tag).toBe("button");
    expect(name?.tabIndex).toBe(0);
    expect(node.find("css-decl")[0]?.textContent).toBe("color: var(--brand);");
    expect(node.find("css-swatch")[0]?.style.backgroundColor).toBe("#0af");
  });

  test("a click on a custom property goes to the block that sets it, and lights it for a moment", () => {
    const root = rule(":root", [declaration("--brand", "#0af")]);
    answer = () =>
      found(
        [
          rule(".primary", [declaration("color", "var(--brand)", { variables: ["--brand"] })]),
          { kind: "inherited", from: "html", element: as(html), blocks: [root] },
        ],
        { variables: { "--brand": { value: "#0af", definedIn: root.id } } },
      );
    const node = start();
    view?.show(as(save));
    const [, defines] = node.find("css-block");
    node.find("css-var")[0]?.fire("click");
    expect(defines?.scrolls).toBe(1);
    expect(defines?.classList.contains("flash")).toBe(true);
    expect(node.find("css-block")[0]?.classList.contains("flash")).toBe(false);
    wait(900);
    expect(defines?.classList.contains("flash")).toBe(false);
  });

  test("a property no declaration in force reads is a piece of its own too, and a click on it goes nowhere", () => {
    answer = () => found([rule(".primary", [declaration("color", "var(--old)", { overridden: true })])]);
    const node = start();
    view?.show(as(save));
    const [name] = node.find("css-var");
    expect(name?.textContent).toBe("--old");
    expect(name?.listeners.get("click")).toBeUndefined();
    expect(node.find("css-decl")[0]?.textContent).toBe("color: var(--old);");
  });

  test("heads what an ancestor hands down, and a click on the heading inspects that ancestor", () => {
    answer = (target) =>
      target === as(app)
        ? found([], { target: { label: "div#app.shell", pseudo: null } })
        : found([
            rule(".primary", [declaration("color", "red")]),
            {
              kind: "inherited",
              from: "div#app.shell",
              element: as(app),
              blocks: [rule("#app", [declaration("font-size", "14px")])],
            },
          ]);
    const node = start();
    view?.show(as(save));
    const [heading] = node.find("css-group");
    expect(heading?.textContent).toBe("inherited from div#app");
    expect(heading?.tag).toBe("button");
    // The heading sits between the element's own block and the ancestor's.
    const order = node.find("css-blocks")[0]?.children.map((child) =>
      typeof child === "string" ? "" : child.className,
    );
    expect(order).toEqual(["css-block", "css-group", "css-block"]);
    heading?.fire("click");
    expect(asked[1]?.element).toBe(as(app));
    expect(titles).toEqual(["button#save.primary", "div#app.shell"]);
  });

  test("heads a pseudo-element's rules, and lists it as a crumb after the element", () => {
    answer = (_target, pseudo) =>
      pseudo
        ? found([rule(".primary::before", [declaration("content", '"+"')])], {
            target: { label: "button#save.primary", pseudo },
          })
        : found([
            rule(".primary", [declaration("color", "red")]),
            {
              kind: "pseudo",
              pseudo: "::before",
              blocks: [rule(".primary::before", [declaration("content", '"+"')])],
            },
          ]);
    const node = start();
    view?.show(as(save));
    expect(node.find("css-group").map((one) => one.textContent)).toEqual(["::before"]);
    const crumbs = node.find("crumb");
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual([
      "html",
      "body",
      "div#app",
      "button#save",
      "::before",
    ]);
    crumbs[4]?.fire("click");
    expect(asked[1]).toEqual({ element: as(save), pseudo: "::before" });
    expect(titles[1]).toBe("button#save.primary::before");
    // The element is no longer the current crumb: its pseudo-element is.
    expect(node.find("crumb").map((crumb) => crumb.getAttribute("aria-current"))).toEqual([
      null,
      null,
      null,
      null,
      "true",
    ]);
  });

  test("ends with a line for each stylesheet it may not read", () => {
    answer = () =>
      found([rule(".primary", [declaration("color", "red")])], {
        hidden: [{ sheet: "https://cdn.example.com/theme.css", reason: "cross-origin" }],
      });
    const node = start();
    view?.show(as(save));
    expect(node.find("css-hidden").map((one) => one.textContent)).toEqual([
      "rules hidden: theme.css (another origin)",
    ]);
    const all = node.find("css-blocks")[0]?.children ?? [];
    expect(all[all.length - 1]).toBe(node.find("css-hidden")[0] as FakeNode);
  });

  test("says so where no rule reaches the element", () => {
    answer = () => found([]);
    const node = start();
    view?.show(as(save));
    expect(note(node)).toBe(NO_RULES);
    expect(node.shown("toolbar")).toHaveLength(1);
  });

  test("shown nothing again, is back to its first line and boxes nothing", () => {
    const node = start();
    view?.show(as(save));
    view?.show(null);
    expect(note(node)).toBe(EMPTY);
    expect(node.find("css-block")).toEqual([]);
    expect(held).toEqual([as(save), null]);
    expect(outlined).toEqual([]);
    expect(titles[titles.length - 1]).toBe("styles");
  });
});

describe("the filter", () => {
  function typed(node: FakeNode, text: string): void {
    const [filter] = node.find("filter");
    if (!filter) throw new Error("no filter");
    filter.value = text;
    filter.fire("input");
  }

  beforeEach(() => {
    answer = () =>
      found([
        rule(".primary", [declaration("color", "red"), declaration("margin", "0 auto")]),
        rule("button", [declaration("padding", "4px")]),
        {
          kind: "inherited",
          from: "div#app.shell",
          element: as(app),
          blocks: [rule("#app", [declaration("font-size", "14px")])],
        },
      ]);
  });

  test("is a field of the panel's own look, with a name", () => {
    const node = start();
    const [filter] = node.find("filter");
    expect(filter?.tag).toBe("input");
    // The kit's, with no class of the view's own.
    expect(filter?.className).toBe("field filter");
    expect(filter?.placeholder).toBe("filter");
    expect(filter?.getAttribute("aria-label")).toBe("filter the declarations");
  });

  test("keeps the declarations that match by name, and hides the blocks left with none", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "col");
    expect(lines(node)).toEqual([["color: red;"]]);
    // Its group has no block left to head.
    expect(node.shown("css-group")).toEqual([]);
    expect(asked).toHaveLength(1);
  });

  test("matches by value too, and keeps the heading of a group with a match", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "14PX");
    expect(lines(node)).toEqual([["font-size: 14px;"]]);
    expect(node.shown("css-group")).toHaveLength(1);
  });

  test("says so where nothing matches, and shows it all again once cleared", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "zzz");
    expect(lines(node)).toEqual([]);
    expect(note(node)).toBe(NO_MATCH);
    typed(node, "");
    expect(lines(node)).toEqual([["color: red;", "margin: 0 auto;"], ["padding: 4px;"], ["font-size: 14px;"]]);
    expect(note(node)).toBeNull();
  });

  test("still holds for the styles read again", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "padding");
    view?.refresh();
    expect(lines(node)).toEqual([["padding: 4px;"]]);
  });

  test("escape clears a filter with text and keeps the pane, and with none leaves it to the pane", () => {
    const node = start();
    view?.show(as(save));
    typed(node, "col");
    expect(view?.escape()).toBe(true);
    expect(node.find("filter")[0]?.value).toBe("");
    expect(lines(node)).toHaveLength(3);
    expect(view?.escape()).toBe(false);
  });
});

describe("the styles view keeping up", () => {
  /** The observer says nodes changed, and the view reads once the page has settled. */
  test("reads again once after a burst of changes to the element, not once for each", () => {
    start();
    view?.show(as(save));
    observer().change(save);
    observer().change(save);
    wait(SETTLE - 1);
    observer().change(app);
    expect(asked).toHaveLength(1);
    wait(SETTLE - 1);
    expect(asked).toHaveLength(1);
    wait(1);
    expect(asked).toHaveLength(2);
    wait(1000);
    expect(asked).toHaveLength(2);
  });

  test("watches the element, each ancestor and the head with one observer", () => {
    start();
    view?.show(as(save));
    expect(FakeObserver.made).toHaveLength(1);
    const watched = observer().watched;
    expect(watched.map((one) => one.node)).toEqual([save, app, body, html, doc.head]);
    expect(watched[0]?.options).toEqual({ attributes: true });
    // What comes and goes under an ancestor is how the element leaving is heard.
    expect(watched[1]?.options).toEqual({ attributes: true, childList: true });
    expect(watched[4]?.options).toEqual({
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  });

  test("drops the engine's rule lists first when a stylesheet in the head changed", () => {
    start();
    view?.show(as(save));
    calls = [];
    observer().change(sheet);
    wait(SETTLE);
    expect(calls).toEqual(["invalidate", "inspect"]);
  });

  test("keeps the engine's rule lists when only the element changed", () => {
    start();
    view?.show(as(save));
    observer().change(save);
    wait(SETTLE);
    expect(invalidated).toBe(0);
    expect(asked).toHaveLength(2);
  });

  test("devknobs' own nodes coming and going, its box or its style element, read nothing", () => {
    start();
    view?.show(as(save));
    const own = { nodeType: 1, hasAttribute: (name: string) => name === "data-devknobs" };
    observer().change(body, [own]);
    observer().change(sheet, [own]);
    wait(1000);
    expect(asked).toHaveLength(1);
    expect(invalidated).toBe(0);
    // A node of the page's that came with it still counts.
    const theirs = { nodeType: 1, hasAttribute: () => false };
    observer().change(body, [own, theirs]);
    wait(SETTLE);
    expect(asked).toHaveLength(2);
  });

  test("reads again when the element's window changes size", () => {
    start();
    view?.show(as(save));
    doc.defaultView?.dispatchEvent(new Event("resize"));
    doc.defaultView?.dispatchEvent(new Event("resize"));
    expect(asked).toHaveLength(1);
    wait(SETTLE);
    expect(asked).toHaveLength(2);
  });

  test("reads again when a knob moves, the stylesheets it rewrites included", () => {
    start();
    view?.show(as(save));
    calls = [];
    for (const listener of knobs) listener({ ...DEFAULT_STATE, scheme: "dark" });
    expect(calls).toEqual([]);
    wait(SETTLE);
    expect(calls).toEqual(["invalidate", "inspect"]);
  });

  test("the panel opening or closing is no knob, and reads nothing", () => {
    start();
    view?.show(as(save));
    const panel = { ...DEFAULT_STATE.panel, open: !DEFAULT_STATE.panel.open };
    for (const listener of knobs) listener({ ...DEFAULT_STATE, panel });
    wait(1000);
    expect(asked).toHaveLength(1);
    expect(invalidated).toBe(0);
  });

  test("stops watching one element when another is shown, and everything when it goes", () => {
    start();
    view?.show(as(save));
    const first = observer();
    view?.show(as(app));
    expect(first.connected).toBe(false);
    expect(observer().watched.map((one) => one.node)).toEqual([app, body, html, doc.head]);
    const second = observer();
    view?.destroy();
    expect(second.connected).toBe(false);
    expect(knobs).toEqual([]);
    doc.defaultView?.dispatchEvent(new Event("resize"));
    wait(1000);
    expect(asked).toHaveLength(2);
  });

  test("a change heard after the view is gone reads nothing", () => {
    start();
    view?.show(as(save));
    observer().change(save);
    view?.destroy();
    wait(1000);
    expect(asked).toHaveLength(1);
  });
});

describe("an element that left the page", () => {
  test("is said in the pane, is held no more, and nothing is watched or read any more", () => {
    const node = start();
    view?.show(as(save));
    const watching = observer();
    save.isConnected = false;
    watching.change(app);
    wait(SETTLE);
    expect(note(node)).toBe(GONE);
    expect(node.find("css-block")).toEqual([]);
    expect(node.shown("toolbar")).toEqual([]);
    expect(held).toEqual([as(save), null]);
    expect(outlined).toEqual([]);
    expect(watching.connected).toBe(false);
    expect(asked).toHaveLength(1);
    view?.refresh();
    expect(asked).toHaveLength(1);
  });

  test("an element of a frame page that was unloaded is gone too", () => {
    const node = start();
    view?.show(as(save));
    doc.defaultView = null;
    view?.refresh();
    expect(note(node)).toBe(GONE);
    expect(held).toEqual([as(save), null]);
  });
});

describe("an element of the device frame's page", () => {
  test("is read as it is, and its own window's size is the one that counts", () => {
    start();
    view?.show(as(save));
    // The engine is handed the frame's live element, not a copy of it.
    expect(asked[0]?.element).toBe(as(save));
    window.dispatchEvent(new Event("resize"));
    wait(SETTLE);
    expect(asked).toHaveLength(1);
    doc.defaultView?.dispatchEvent(new Event("resize"));
    wait(SETTLE);
    expect(asked).toHaveLength(2);
  });
});

describe("editing", () => {
  let log: EditLog;
  let style: Block & CSSStyleDeclaration;

  beforeEach(() => {
    Object.defineProperty(globalThis, "CSS", { configurable: true, value: fakeCss });
    log = createEditLog();
    style = new Block("color: red; margin: 0; padding: 4px;") as Block & CSSStyleDeclaration;
    // The engine reads the rule's text as it is now.
    answer = () =>
      found([
        rule(
          ".primary",
          parseDeclarations(style.cssText).map((one) => declaration(one.name, one.value, { important: one.important })),
          { rule: { style } as unknown as CSSStyleRule },
        ),
      ]);
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "CSS");
  });

  function editing(): FakeNode {
    const node = start(log);
    view?.show(as(save));
    return node;
  }

  /** The value field of a property's line, as a click opens it. */
  function open(node: FakeNode, property: string): FakeNode {
    const value = node.find("css-editable").find((one) => one.getAttribute("aria-label")?.startsWith(`edit ${property}:`));
    if (!value) throw new Error(`no value for ${property}`);
    value.fire("click", { target: value });
    return field(node);
  }

  function field(node: FakeNode): FakeNode {
    const [input] = node.find("css-edit");
    if (!input) throw new Error("no field");
    return input;
  }

  function type(input: FakeNode, text: string): void {
    Reflect.set(input, "value", text);
  }

  test("Enter puts a value on the page, and the view reads it again at once", () => {
    const node = editing();
    const reads = asked.length;
    const input = open(node, "margin");
    expect(Reflect.get(input, "value")).toBe("0");
    type(input, "8px");
    input.fire("keydown", { key: "Enter" });
    expect(style.cssText).toBe("color: red; margin: 8px; padding: 4px;");
    expect(log.list()).toMatchObject([{ kind: "css-value", property: "margin", before: "0", after: "8px" }]);
    expect(asked.length).toBe(reads + 1);
    expect(node.find("css-edit")).toEqual([]);
    expect(lines(node)).toEqual([["color: red;", "margin: 8px;", "padding: 4px;"]]);
    expect(node.focused).toBe(true);
  });

  test("escape leaves the value as it was", () => {
    const node = editing();
    const input = open(node, "margin");
    type(input, "8px");
    input.fire("keydown", { key: "Escape" });
    expect(log.list()).toEqual([]);
    expect(node.find("css-edit")).toEqual([]);
    expect(lines(node)).toEqual([["color: red;", "margin: 0;", "padding: 4px;"]]);
  });

  test("escape in the panel closes the field before it clears the filter", () => {
    const node = editing();
    open(node, "margin");
    expect(view?.escape()).toBe(true);
    expect(node.find("css-edit")).toEqual([]);
  });

  test("Tab puts the value on and goes to the next one, shift Tab to the one before", () => {
    const node = editing();
    const input = open(node, "margin");
    type(input, "2px");
    input.fire("keydown", { key: "Tab" });
    const next = field(node);
    expect(Reflect.get(next, "value")).toBe("4px");
    next.fire("keydown", { key: "Tab", shiftKey: true });
    expect(Reflect.get(field(node), "value")).toBe("2px");
    expect(log.list().map((one) => one.after)).toEqual(["2px"]);
  });

  test("a value the page does not take keeps the field open, marked", () => {
    const node = editing();
    const input = open(node, "margin");
    type(input, "nope");
    input.fire("keydown", { key: "Enter" });
    expect(field(node)).toBe(input);
    expect(input.classList.contains("bad")).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(log.list()).toEqual([]);
  });

  test("a click elsewhere puts the value on, and the view waits for that click to land", () => {
    const node = editing();
    const reads = asked.length;
    const input = open(node, "margin");
    type(input, "8px");
    input.fire("blur");
    expect(log.list().map((one) => one.after)).toEqual(["8px"]);
    // The pointer comes up, and the click that took the focus lands on the value it was pressed on.
    expect(asked.length).toBe(reads);
    window.dispatchEvent(new Event("pointerup"));
    const next = open(node, "padding");
    expect(Reflect.get(next, "value")).toBe("4px");
    wait(0);
    expect(asked.length).toBe(reads);
    next.fire("keydown", { key: "Escape" });
    expect(asked.length).toBe(reads + 1);
    expect(lines(node)).toEqual([["color: red;", "margin: 8px;", "padding: 4px;"]]);
  });

  test("with no click after it, the view reads again once the pointer is up, or after a while", () => {
    const node = editing();
    const reads = asked.length;
    const input = open(node, "margin");
    type(input, "8px");
    input.fire("blur");
    window.dispatchEvent(new Event("pointerup"));
    wait(0);
    expect(asked.length).toBe(reads + 1);
    const other = open(node, "color");
    type(other, "blue");
    other.fire("blur");
    expect(asked.length).toBe(reads + 1);
    wait(HOLD);
    expect(asked.length).toBe(reads + 2);
    expect(style.cssText).toBe("color: blue; margin: 8px; padding: 4px;");
  });

  test("a value the page does not take is let go when the focus leaves", () => {
    const node = editing();
    const input = open(node, "margin");
    type(input, "nope");
    input.fire("blur");
    expect(log.list()).toEqual([]);
    expect(node.find("css-edit")).toEqual([]);
  });

  test("adds a property: a name, then a value", () => {
    const node = editing();
    const [add] = node.find("css-add");
    if (!add) throw new Error("no add line");
    expect(add.textContent).toBe(ADD);
    add.fire("click");
    const [name, value] = node.find("css-edit");
    if (!name || !value) throw new Error("no fields");
    expect(name.focused).toBe(true);
    type(name, "Gap");
    name.fire("keydown", { key: "Enter" });
    expect(value.focused).toBe(true);
    type(value, "6px");
    value.fire("keydown", { key: "Enter" });
    expect(log.list()).toMatchObject([{ kind: "css-add", property: "gap", before: null, after: "6px" }]);
    expect(style.cssText).toBe("color: red; margin: 0; padding: 4px; gap: 6px;");
    expect(node.find("css-adding")).toEqual([]);
  });

  test("escape in the name leaves the block as it was", () => {
    const node = editing();
    node.find("css-add")[0]?.fire("click");
    const [name] = node.find("css-edit");
    name?.fire("keydown", { key: "Escape" });
    expect(node.find("css-adding")).toEqual([]);
    expect(node.find("css-add")).toHaveLength(1);
    expect(log.list()).toEqual([]);
  });

  test("a declaration's box turns it off through the log, and the line stays, struck through, where it stood", () => {
    const node = editing();
    const box = node.find("css-toggle")[1];
    if (!box) throw new Error("no box");
    expect(box.getAttribute("aria-label")).toBe("turn off margin");
    Reflect.set(box, "checked", false);
    box.fire("change");
    expect(box.getAttribute("aria-label")).toBe("turn on margin");
    expect(style.cssText).toBe("color: red; padding: 4px;");
    expect(log.list()).toMatchObject([
      {
        kind: "css-toggle",
        property: "margin",
        before: "0",
        after: null,
        target: { rule: { selectorText: ".primary", sheet: "https://example.com/assets/app.css", path: [0], context: [] } },
      },
    ]);
    expect(lines(node)).toEqual([["color: red;", "margin: 0;", "padding: 4px;"]]);
    const [struck] = node.find("off");
    expect(struck?.tag).toBe("s");
    const again = struck?.find("css-toggle")[0];
    if (!again) throw new Error("no box on the struck line");
    expect(again.getAttribute("aria-label")).toBe("turn on margin");
    Reflect.set(again, "checked", true);
    again.fire("change");
    expect(style.cssText).toBe("color: red; margin: 0; padding: 4px;");
    expect(node.find("off")).toEqual([]);
  });

  test("puts a line to add a property under each rule it can edit", () => {
    const other = new Block("gap: 0;") as Block & CSSStyleDeclaration;
    const first = answer;
    answer = (element, pseudo) => {
      const read = first(element, pseudo);
      read.blocks.push(rule(".shell .primary", [declaration("gap", "0")], { rule: { style: other } as unknown as CSSStyleRule }));
      return read;
    };
    const node = editing();
    expect(node.find("css-add").map((one) => one.textContent)).toEqual([ADD, ADD]);
  });

  test("still says no rule reaches the element, under its own style to add to", () => {
    answer = () => found([]);
    const element = Object.assign(as(save), { style: new Block() });
    const node = start(log);
    view?.show(element);
    expect(note(node)).toBe(NO_RULES);
    expect(node.find("css-add")).toHaveLength(1);
  });

  test("an empty value is no edit: the field stays open, marked", () => {
    const node = editing();
    const input = open(node, "margin");
    type(input, "  ");
    input.fire("keydown", { key: "Enter" });
    expect(field(node)).toBe(input);
    expect(input.classList.contains("bad")).toBe(true);
    expect(log.list()).toEqual([]);
  });

  test("a value put back as it was leaves its line as drawn, !important and all", () => {
    style.cssText = "color: red !important; margin: 0;";
    const node = editing();
    const input = open(node, "color");
    expect(Reflect.get(input, "value")).toBe("red !important");
    input.fire("blur");
    expect(log.list()).toEqual([]);
    expect(lines(node)[0]?.[0]).toBe("color: red !important;");
  });

  test("says why the stylesheets it may not read cannot be edited", () => {
    answer = () => found([rule(".primary", [declaration("color", "red")])], { hidden: [{ sheet: "https://cdn.example.com/theme.css", reason: "cross-origin" }] });
    const node = editing();
    const [line] = node.find("css-hidden");
    expect(tipped.filter(([at]) => at === line).map(([, text]) => text)).toEqual([READ_ONLY]);
  });

  test("is read only without a log: no box, no field and no line to add", () => {
    answer = () => found([rule(".primary", [declaration("color", "red")])], { hidden: [{ sheet: "https://cdn.example.com/theme.css", reason: "cross-origin" }] });
    const node = start();
    view?.show(as(save));
    expect(node.find("css-toggle")).toEqual([]);
    expect(node.find("css-editable")).toEqual([]);
    expect(node.find("css-add")).toEqual([]);
    expect(tipped.map(([, text]) => text)).not.toContain(READ_ONLY);
  });
  test("chips over the rules force a state on the element, as no edit", () => {
    const node = editing();
    const [chips] = node.shown("force-states");
    expect(chips?.getAttribute("aria-label")).toBe(FORCE_LABEL);
    const chip = (state: string): FakeNode => {
      const found = node.find("chip").find((one) => one.textContent === `:${state}`);
      if (!found) throw new Error(`no :${state} chip`);
      return found;
    };
    expect(node.find("force-states")[0]?.find("chip").map((one) => one.textContent)).toEqual([":hover", ":focus", ":focus-visible", ":active", ":focus-within"]);
    const reads = asked.length;
    chip("hover").fire("click");
    expect(forced).toEqual({ element: as(save), states: ["hover"] });
    expect(chip("hover").getAttribute("aria-pressed")).toBe("true");
    // The view reads the styles again, the copies of the rules made first.
    expect(asked.length).toBe(reads + 1);
    expect(forceCalls).toEqual(["set hover", "sync"]);
    chip("focus-visible").fire("click");
    expect(forced?.states).toEqual(["hover", "focus-visible"]);
    chip("hover").fire("click");
    expect(forced?.states).toEqual(["focus-visible"]);
    expect(chip("hover").getAttribute("aria-pressed")).toBe("false");
    expect(log.list()).toEqual([]);
  });

  test("the states end when another element is shown, and when the view goes", () => {
    const node = editing();
    const hover = node.find("chip").find((one) => one.textContent === ":hover");
    if (!hover) throw new Error("no :hover chip");
    hover.fire("click");
    expect(forced).toEqual({ element: as(save), states: ["hover"] });
    view?.show(as(app));
    expect(forced).toBeNull();
    expect(forceCalls.at(-1)).toBe("clear");
    view?.show(as(save));
    const active = node.find("chip").find((one) => one.textContent === ":active");
    if (!active) throw new Error("no :active chip");
    active.fire("click");
    expect(forced).toEqual({ element: as(save), states: ["active"] });
    view?.destroy();
    view = null;
    expect(forced).toBeNull();
  });

  test("the states another element has are not the shown one's, and stay", () => {
    forced = { element: as(app), states: ["hover"] };
    const node = editing();
    expect(node.find("chip")).toHaveLength(FORCED_STATES.length);
    expect(node.find("chip").every((one) => one.getAttribute("aria-pressed") === "false")).toBe(true);
    view?.show(as(body));
    expect(forced).toEqual({ element: as(app), states: ["hover"] });
  });

  test("has no chips without a log, nor with no element", () => {
    const plain = start();
    view?.show(as(save));
    expect(plain.find("force-states")).toEqual([]);
    view?.destroy();
    const empty = start(log);
    expect(empty.shown("force-states")).toEqual([]);
  });

  test("adds a new rule: its selector from the element and the states forced, then a property", async () => {
    Object.assign(save, { getRootNode: () => new PageDocument() });
    forced = { element: as(save), states: ["hover"] };
    const node = editing();
    const [line] = node.find("css-new-rule");
    if (!line) throw new Error("no new rule line");
    expect(line.textContent).toBe(NEW_RULE);
    line.fire("click");
    const [selector] = node.find("css-edit");
    if (!selector) throw new Error("no field");
    expect(Reflect.get(selector, "value")).toBe(".primary:hover");
    expect(selector.focused).toBe(true);
    selector.fire("keydown", { key: "Enter" });
    expect(log.list()).toMatchObject([{ kind: "css-rule", property: "rule", before: null, after: ".primary:hover" }]);
    // The engine does not list it, as it does not match: it is drawn after the element's own rules, its selector off.
    const block = node.find("css-block").find((one) => one.find("css-source")[0]?.textContent === "new rule");
    expect(block?.find("css-part").map((one) => [one.textContent, one.classList.contains("off")])).toEqual([[".primary:hover", true]]);
    await Promise.resolve();
    const [name, value] = block?.find("css-edit") ?? [];
    if (!name || !value) throw new Error("the new rule's line for a property did not open");
    expect(name.focused).toBe(true);
    Reflect.set(name, "value", "background");
    name.fire("keydown", { key: "Enter" });
    Reflect.set(value, "value", "#2f6df6");
    value.fire("keydown", { key: "Enter" });
    expect(log.list().map((one) => [one.kind, one.property, one.after, one.target.rule?.sheet])).toEqual([
      ["css-rule", "rule", ".primary:hover", "new rule"],
      ["css-add", "background", "#2f6df6", "new rule"],
    ]);
    const shown = node.find("css-block").find((one) => one.find("css-source")[0]?.textContent === "new rule");
    expect(shown?.find("css-decl").map((one) => one.textContent)).toContain("background: #2f6df6;");
    log.undoAll();
    expect(node.find("css-source").map((one) => one.textContent)).not.toContain("new rule");
  });

  test("in simple mode, a new rule made for one element applies to another it matches", () => {
    Object.assign(save, { getRootNode: () => new PageDocument() });
    view = createStylesView(
      { tips, title: () => undefined, outline: () => undefined, edits: log, mode: { get: () => "simple", set: () => undefined } },
      page,
    );
    const paneBody = new FakeNode("div");
    paneBody.root = true;
    paneBody.append(fake(view.node));
    const node = fake(view.node);
    view.show(as(save));
    const [line] = node.find("css-new-rule");
    if (!line) throw new Error("no new rule line");
    line.fire("click");
    const [selector] = node.find("css-edit");
    if (!selector) throw new Error("no field");
    Reflect.set(selector, "value", ".primary");
    selector.fire("keydown", { key: "Enter" });
    const made = log.recorded()[0]?.edit.target.rule;
    const ruleObject = newRulesFor(log.recorded(), as(save))[0];
    if (!made || !ruleObject) throw new Error("no rule");
    ruleObject.style.setProperty("background", "#2f6df6");
    // Another element the rule matches: the engine lists the rule for it, which no rule made for it shows.
    answer = () =>
      found([
        rule(".primary", [declaration("background", "#2f6df6")], { rule: ruleObject, origin: { sheet: "new rule", owner: null, path: [0] } }),
      ]);
    view.show(as(app));
    expect(node.find("css-applied")[0]?.find("css-decl").map((one) => one.textContent)).toContain("background: #2f6df6");
  });

  /** Open the new rule's field, with its selector set where given. */
  function newRuleField(node: FakeNode, text?: string): FakeNode {
    const [line] = node.find("css-new-rule");
    if (!line) throw new Error("no new rule line");
    line.fire("click");
    const [selector] = node.find("css-edit");
    if (!selector) throw new Error("no field");
    if (text !== undefined) Reflect.set(selector, "value", text);
    return selector;
  }

  test("a click elsewhere adds no rule where the selector is as it opened", () => {
    Object.assign(save, { getRootNode: () => new PageDocument() });
    const node = editing();
    newRuleField(node).fire("blur");
    expect(log.list()).toEqual([]);
    expect(node.find("css-new-rule")).toHaveLength(1);
  });

  test("a click elsewhere adds a rule with a selector typed, and leaves the focus where it went", async () => {
    Object.assign(save, { getRootNode: () => new PageDocument() });
    const node = editing();
    newRuleField(node, ".primary:focus").fire("blur");
    expect(log.list().map((one) => [one.kind, one.after])).toEqual([["css-rule", ".primary:focus"]]);
    await Promise.resolve();
    expect(node.find("css-adding")).toEqual([]);
  });

  test("a new rule the filter hides does not open its line for a property", async () => {
    Object.assign(save, { getRootNode: () => new PageDocument() });
    const node = editing();
    const [filter] = node.find("filter");
    if (!filter) throw new Error("no filter");
    filter.value = "color";
    filter.fire("input");
    newRuleField(node, ".primary:hover").fire("keydown", { key: "Enter" });
    expect(log.list()).toHaveLength(1);
    await Promise.resolve();
    expect(node.find("css-adding")).toEqual([]);
  });

  test("a selector the page does not take keeps the new rule's field open, marked", () => {
    Object.assign(save, { getRootNode: () => new PageDocument() });
    const node = editing();
    const [line] = node.find("css-new-rule");
    if (!line) throw new Error("no new rule line");
    line.fire("click");
    const [selector] = node.find("css-edit");
    if (!selector) throw new Error("no field");
    Reflect.set(selector, "value", ".primary!!");
    selector.fire("keydown", { key: "Enter" });
    expect(node.find("css-edit")[0]).toBe(selector);
    expect(selector.getAttribute("aria-invalid")).toBe("true");
    expect(log.list()).toEqual([]);
    selector.fire("keydown", { key: "Escape" });
    expect(node.find("css-edit")).toEqual([]);
    expect(node.find("css-new-rule")).toHaveLength(1);
  });
});
