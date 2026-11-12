import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Keeper } from "../src/edit/keep";
import { BRANDS } from "../src/ui/icons";
import { creditRow, feedbackUrl, githubRow, KEEP_HINT, KEEP_LABEL, keepRow, vinenaUrl } from "../src/ui/settings";
import { fake, FakeNode } from "./styles-dom";

describe("the keep edits row", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");

  beforeEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (tag: string) => new FakeNode(tag),
        createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
      },
    });
  });

  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, "document", saved);
    else Reflect.deleteProperty(globalThis, "document");
  });

  /** A keeper the test turns, and what the row asked of it. */
  function stubKeeper(): { keep: Keeper; turned: boolean[]; listeners: Set<() => void>; state: { on: boolean; known: boolean } } {
    const state = { on: false, known: false };
    const turned: boolean[] = [];
    const listeners = new Set<() => void>();
    const keep: Keeper = {
      on: () => state.on,
      set: (next) => void turned.push(next),
      restored: () => null,
      known: () => state.known,
      waiting: () => [],
      applyWaiting: () => undefined,
      kept: () => 0,
      cut: () => 0,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      stop: () => undefined,
    };
    return { keep, turned, listeners, state };
  }

  const control = (node: HTMLElement): FakeNode | undefined => fake(node).all().find((one) => one.getAttribute("role") === "switch");

  test("is hidden without a keeper, and shows once one starts and the settings open", () => {
    let keep: Keeper | null = null;
    const row = keepRow(() => keep);
    expect(row.node.hidden).toBe(true);
    keep = stubKeeper().keep;
    row.sync();
    expect(row.node.hidden).toBe(false);
    expect(fake(row.node).textContent).toBe(KEEP_LABEL + KEEP_HINT);
  });

  test("shows the keeper's switch, off to a click until it knows, and turns it on a click", () => {
    const { keep, turned, listeners, state } = stubKeeper();
    const row = keepRow(() => keep);
    const on = control(row.node);
    expect(on?.getAttribute("aria-checked")).toBe("false");
    expect(on && Reflect.get(on, "disabled")).toBe(true);
    state.known = true;
    for (const listener of listeners) listener();
    expect(on && Reflect.get(on, "disabled")).toBe(false);
    on?.fire("click");
    expect(turned).toEqual([true]);
    state.on = true;
    for (const listener of listeners) listener();
    expect(on?.getAttribute("aria-checked")).toBe("true");
    on?.fire("click");
    expect(turned).toEqual([true, false]);
    row.destroy();
    expect(listeners.size).toBe(0);
  });
});

describe("the links after send feedback", () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");

  beforeEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (tag: string) => new FakeNode(tag),
        createElementNS: (_namespace: string, tag: string) => new FakeNode(tag),
      },
    });
  });

  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, "document", saved);
    else Reflect.deleteProperty(globalThis, "document");
  });

  const link = (node: HTMLElement): FakeNode | undefined => fake(node).all().find((one) => one.tag === "a");

  test("the studio's address is the site's own, with the copy the link is in", () => {
    expect(vinenaUrl(false)).toBe("https://vinena.studio/?utm_source=knobs.dev&utm_medium=referral&utm_campaign=panel");
    expect(vinenaUrl(true)).toBe("https://vinena.studio/?utm_source=knobs.dev&utm_medium=referral&utm_campaign=extension");
  });

  test("the github row opens the repo in a new tab, under the GitHub mark", () => {
    const row = githubRow();
    const a = link(row);
    expect(a?.getAttribute("href")).toBe("https://github.com/vinenastudio/knobs");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a?.className).toBe("main feedback");
    expect(fake(row).textContent).toBe("github");
    const [mark] = a?.children ?? [];
    expect(typeof mark !== "string" && mark?.children.map((path) => typeof path !== "string" && path.getAttribute("d"))).toEqual([BRANDS.github[1]]);
  });

  test("the credit is one link in a new tab: its words, then the wordmark drawn and named, never typed", () => {
    for (const host of [false, true]) {
      const a = fake(creditRow(host));
      expect(a.tag).toBe("a");
      expect(a.getAttribute("href")).toBe(vinenaUrl(host));
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.textContent).toBe("crafted at");
      const mark = a.all().find((one) => one.tag === "svg");
      expect(mark?.getAttribute("role")).toBe("img");
      expect(mark?.getAttribute("aria-label")).toBe("Vinena");
      expect(mark?.getAttribute("viewBox")).toBe("-3.1 0 537.6 100");
      expect(mark?.all().find((one) => one.tag === "path")?.getAttribute("d")).toStartWith("M147.7 0L205.7 39.97");
    }
  });

  test("each link's address is a fixed one, whatever page the panel is on, with no listener to change it", () => {
    Object.defineProperty(globalThis, "location", { configurable: true, value: { href: "https://example.com/secret?token=x" } });
    try {
      for (const [node, href] of [
        [githubRow(), "https://github.com/vinenastudio/knobs"],
        [creditRow(false), "https://vinena.studio/?utm_source=knobs.dev&utm_medium=referral&utm_campaign=panel"],
        [creditRow(true), "https://vinena.studio/?utm_source=knobs.dev&utm_medium=referral&utm_campaign=extension"],
      ] as const) {
        const a = fake(node).tag === "a" ? fake(node) : link(node);
        expect(a?.getAttribute("href")).toBe(href);
        expect(a?.listeners.size).toBe(0);
      }
    } finally {
      Reflect.deleteProperty(globalThis, "location");
    }
  });
});

describe("the feedback link", () => {
  test("names the product, the version and the page", () => {
    expect(feedbackUrl("0.5.1", "https://example.com/a")).toBe(
      "https://feedback.vinena.studio/?product=knobs&v=0.5.1&page=https%3A%2F%2Fexample.com%2Fa",
    );
  });

  test("leaves the query and the fragment out of the page", () => {
    const page = "https%3A%2F%2Fexample.com%2Fa";
    expect(feedbackUrl("source", "https://example.com/a?token=x")).toEndWith(`&page=${page}`);
    expect(feedbackUrl("source", "https://example.com/a#secret")).toEndWith(`&page=${page}`);
    expect(feedbackUrl("source", "https://example.com/a?b=c#d")).toEndWith(`&page=${page}`);
  });

  test("keeps the port of a local page", () => {
    expect(feedbackUrl("source", "http://localhost:5173/x?y=1")).toEndWith(
      "&page=http%3A%2F%2Flocalhost%3A5173%2Fx",
    );
  });

  test("keeps pages that are not http or https whole but for the query and fragment", () => {
    expect(feedbackUrl("source", "about:blank")).toEndWith("&page=about%3Ablank");
    expect(feedbackUrl("source", "file:///Users/me/a.html?t=1#f")).toEndWith(
      "&page=file%3A%2F%2F%2FUsers%2Fme%2Fa.html",
    );
    expect(feedbackUrl("source", "blob:https://ex.com/uuid-1?x#y")).toEndWith(
      "&page=blob%3Ahttps%3A%2F%2Fex.com%2Fuuid-1",
    );
    expect(feedbackUrl("source", "chrome-extension://abcd/page.html")).toEndWith(
      "&page=chrome-extension%3A%2F%2Fabcd%2Fpage.html",
    );
  });

  test("drops the login details of the page", () => {
    expect(feedbackUrl("source", "https://u:p@ex.com/a?b#c")).toEndWith("&page=https%3A%2F%2Fex.com%2Fa");
  });

  test("drops from the first ? or # of an address it cannot parse", () => {
    expect(feedbackUrl("source", "not a url#a?b")).toEndWith("&page=not%20a%20url");
    expect(feedbackUrl("source", "/a/b?c")).toEndWith("&page=%2Fa%2Fb");
  });

  test("leaves the version out for a copy run from source", () => {
    expect(feedbackUrl("source", "https://example.com/")).toBe(
      "https://feedback.vinena.studio/?product=knobs&page=https%3A%2F%2Fexample.com%2F",
    );
  });
});
