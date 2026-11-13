import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { bandSpan, drawAbove, forgetPixels, inSpan, raiseOf, layersOf, readSize, sameOrigin, sizedPicture, urlOf } from "../src/engine/bandmedia";
import type { Look } from "../src/engine/browserkit";
import { blankUrl } from "../src/engine/pageshot";
import { bodyScroller, createUnderbar, pictureOf, scrollOf } from "../src/engine/underbar";

/** How the page in the frame lays out: its viewport, its scroll and its device px. */
const VIEW = { innerWidth: 400, innerHeight: 700, scrollX: 0, scrollY: 0, devicePixelRatio: 3 };

/** A computed style with what a page that sets nothing computes. */
function computed(over: Record<string, string> = {}): Record<string, string> {
  return {
    position: "static",
    overflowX: "visible",
    overflowY: "visible",
    backgroundImage: "none",
    backgroundSize: "auto",
    backgroundPosition: "0% 0%",
    objectFit: "fill",
    objectPosition: "50% 50%",
    imageRendering: "auto",
    fontSize: "16px",
    zoom: "1",
    borderLeftWidth: "0px",
    borderRightWidth: "0px",
    borderTopWidth: "0px",
    borderBottomWidth: "0px",
    paddingLeft: "0px",
    paddingRight: "0px",
    paddingTop: "0px",
    paddingBottom: "0px",
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "0px",
    borderBottomRightRadius: "0px",
    borderBottomLeftRadius: "0px",
    ...over,
  };
}

/** Does `node` match one part of a selector list: a name or an attribute that is set. */
function matchesPart(node: Node, part: string): boolean {
  return part.startsWith("[") ? node.attributes.has(part.slice(1, -1)) : node.localName === part;
}

/** An element of the frame's page, or of its copy: where it lies in the document, what it computes, and what it holds. */
class Node {
  children: Node[] = [];
  parentElement: Node | null = null;
  readonly attributes = new Map<string, string>();
  text = "";
  /** Its box in the document's css px, and its computed style. */
  box = { left: 0, top: 0, width: 0, height: 0 };
  style = computed();
  /** Does it show, as `checkVisibility` tells: not hidden, nor wholly see-through. */
  shown = true;
  /** How far it is scrolled, and how tall what it holds is, where it scrolls: a body that does. */
  scrollTop = 0;
  scrollHeight = 0;
  clientTop = 0;
  constructor(
    readonly localName: string,
    attributes: Record<string, string> = {},
    children: Node[] = [],
  ) {
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
    this.append(...children);
  }
  at(left: number, top: number, width: number, height: number): this {
    this.box = { left, top, width, height };
    return this;
  }
  styled(over: Record<string, string>): this {
    this.style = computed(over);
    return this;
  }
  /** Its box in the viewport, as the frame is scrolled now. */
  getBoundingClientRect() {
    // What a body holds moves with the body's scroll too.
    const body = this.parentElement?.closest("body");
    const top = this.box.top - VIEW.scrollY - (body?.scrollTop ?? 0);
    const { left, width, height } = this.box;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  }
  get textContent(): string {
    return this.text;
  }
  set textContent(text: string) {
    this.text = text;
  }
  append(...nodes: Node[]): void {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  remove(): void {
    const holder = this.parentElement;
    if (holder) holder.children = holder.children.filter((node) => node !== this);
    this.parentElement = null;
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  all(): Node[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }
  contains(node: Node): boolean {
    return node === this || this.all().includes(node);
  }
  checkVisibility(): boolean {
    for (let at: Node | null = this; at; at = at.parentElement) if (!at.shown) return false;
    return true;
  }
  getElementsByTagName(): Node[] {
    return this.all();
  }
  matches(selector: string): boolean {
    return selector.split(",").some((part) => matchesPart(this, part.trim()));
  }
  closest(selector: string): Node | null {
    for (let at: Node | null = this; at; at = at.parentElement) if (at.matches(selector)) return at;
    return null;
  }
  querySelectorAll(selector: string): Node[] {
    return this.all().filter((node) => node.matches(selector));
  }
  querySelector(selector: string): Node | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  /** A copy as a document of its own imports it: what is set on it, with nothing it shows. */
  clone(): Node {
    return new Node(this.localName, Object.fromEntries(this.attributes), this.children.map((child) => child.clone()));
  }
  addEventListener(): void {}
}

/** A picture of the page: its address, its size as made, and whether the frame may read it. */
class Picture extends Node {
  complete = true;
  currentSrc: string;
  src: string;
  constructor(
    address: string,
    public naturalWidth: number,
    public naturalHeight: number,
    readonly tainted = false,
  ) {
    super("img", { src: address });
    this.currentSrc = address;
    this.src = address;
  }
  get srcset(): string {
    return this.getAttribute("srcset") ?? "";
  }
}

/** A drawing of the page, `width` by `height` px. */
class Drawing extends Node {
  constructor(
    public width: number,
    public height: number,
  ) {
    super("canvas", { width: String(width), height: String(height) });
  }
}

/** A video of the page: its source, its frame's size where it has one, whether it has played, its poster, and whether the frame may read it. */
class Video extends Node {
  currentSrc: string;
  readyState = 4;
  paused = false;
  currentTime = 3;
  played = { length: 1 };
  /** What it was asked to tell at its next frame. */
  frames: (() => void)[] = [];
  constructor(
    address: string,
    public videoWidth: number,
    public videoHeight: number,
    readonly tainted = false,
    public poster = "",
  ) {
    super("video", { src: address });
    this.currentSrc = address;
  }
  requestVideoFrameCallback(next: () => void): number {
    this.frames.push(next);
    return this.frames.length;
  }
  /** It has no frame yet: it was not asked for, or has not come. */
  unready(): this {
    Object.assign(this, { readyState: 0, videoWidth: 0, videoHeight: 0, paused: true, currentTime: 0, played: { length: 0 } });
    return this;
  }
}

/** A picture the page has loaded: its size, whether the frame may read it, and whether the browser has it for a request with CORS too. */
type Loaded = { width: number; height: number; tainted?: boolean; cors?: false };

/** A picture the frame makes to read a background picture by: it has the page's at once, where the page has loaded it, but asked for with CORS not where the page loaded it without (`cors: false`). */
class Probe {
  complete = false;
  crossOrigin: string | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  tainted = false;
  currentSrc = "";
  /** What it tells when it comes, and when it fails to. */
  heard: (() => void)[] = [];
  failed: (() => void)[] = [];
  constructor(
    readonly ownerDocument: unknown,
    readonly loaded: Map<string, Loaded>,
  ) {}
  addEventListener(type: string, listener: () => void): void {
    (type === "error" ? this.failed : this.heard).push(listener);
  }
  set src(address: string) {
    this.currentSrc = address;
    const has = this.loaded.get(address);
    if (!has || (this.crossOrigin !== null && has.cors === false)) return;
    this.complete = true;
    this.naturalWidth = has.width;
    this.naturalHeight = has.height;
    this.tainted = has.tainted ?? false;
  }
}

/** A canvas of the host's, which tells what was drawn on it, and as data what was drawn, or throws where that came from another origin. */
class Canvas {
  width = 0;
  height = 0;
  style: Record<string, string> = {};
  readonly calls: [string, unknown[]][] = [];
  drawn: unknown[] = [];
  static made: Canvas[] = [];
  static reads = new Map<string, number>();
  constructor() {
    Canvas.made.push(this);
  }
  getContext() {
    const calls = this.calls;
    const record = (name: string) => (...args: unknown[]) => {
      calls.push([name, args]);
      if (name === "drawImage") this.drawn.push(args[0]);
    };
    return new Proxy({} as Record<string, unknown>, {
      get: (target, name: string) => (name in target ? target[name] : record(name)),
      set: (target, name: string, value) => {
        target[name] = value;
        return true;
      },
    });
  }
  remove(): void {}
  toDataURL(): string {
    const source = this.drawn.at(-1) as { tainted?: boolean; currentSrc?: string; label?: string } | undefined;
    if (source?.tainted) throw new Error("SecurityError: the canvas has been tainted");
    const label = source?.currentSrc || source?.label || "?";
    Canvas.reads.set(label, (Canvas.reads.get(label) ?? 0) + 1);
    return `data:image/webp;base64,${label}@${this.width}x${this.height}`;
  }
}

/** The copy the picture was made of, as it was serialized. */
let serialized: Node | null = null;

function markupOf(node: Node): string {
  const attrs = [...node.attributes].map(([name, value]) => ` ${name}="${value.replace(/"/g, "&quot;")}"`).join("");
  return `<${node.localName}${attrs}>${node.text}${node.children.map(markupOf).join("")}</${node.localName}>`;
}

/** An element of the host's: the band, or the picture in it, which decodes at once. */
class HostNode {
  style: Record<string, string> = {};
  className = "";
  hidden = false;
  alt = "";
  src = "";
  readonly children: object[] = [];
  setAttribute(): void {}
  append(...nodes: object[]): void {
    this.children.push(...nodes);
  }
  remove(): void {}
  replaceWith(node: object): void {
    for (const holder of HostNode.made) {
      const at = holder.children.indexOf(this);
      if (at >= 0) holder.children[at] = node;
    }
  }
  decode(): Promise<void> {
    return Promise.resolve();
  }
  static made: HostNode[] = [];
  constructor() {
    HostNode.made.push(this);
  }
}

/** The host's timers, run by hand. */
let timers: (() => void)[] = [];

const GLOBALS = ["document", "window", "XMLSerializer", "Image", "MutationObserver"];
let before: unknown[] = [];

beforeEach(() => {
  before = GLOBALS.map((name) => Reflect.get(globalThis, name));
  Reflect.set(globalThis, "document", { createElement: (tag: string) => (tag === "canvas" ? new Canvas() : new HostNode()) });
  Reflect.set(globalThis, "window", {
    devicePixelRatio: 2,
    setTimeout: (run: () => void) => timers.push(run),
  });
  Reflect.set(globalThis, "Image", HostNode);
  Reflect.set(globalThis, "MutationObserver", class {
    observe(): void {}
    disconnect(): void {}
  });
  Reflect.set(globalThis, "XMLSerializer", class {
    serializeToString(node: Node): string {
      serialized = node;
      return markupOf(node);
    }
  });
  Canvas.made = [];
  Canvas.reads = new Map();
  HostNode.made = [];
  timers = [];
  serialized = null;
  VIEW.scrollY = 0;
});

afterEach(() => {
  for (const [index, name] of GLOBALS.entries()) Reflect.set(globalThis, name, before[index]);
  forgetPixels();
});

/** The frame, with `body` for its page, `loaded` for the pictures its css has loaded, and `rules` for its css. */
function frameOf(body: Node[], loaded = new Map<string, Loaded>(), rules: string[] = []) {
  const root = new Node("html", {}, [new Node("head"), new Node("body", {}, body)]);
  root.box = { left: 0, top: 0, width: VIEW.innerWidth, height: 4000 };
  const probes: Probe[] = [];
  const inert = { importNode: (node: Node) => node.clone(), createElement: (name: string) => new Node(name) };
  const view = {
    ...VIEW,
    get scrollY() {
      return VIEW.scrollY;
    },
    getComputedStyle: (node: Node) => node.style,
    matchMedia: () => ({ matches: false }),
    location: { origin: "https://site.test" },
  };
  /** The listeners on the document, by the event they hear. */
  const heard = new Map<string, unknown>();
  const doc = {
    documentElement: Object.assign(root, { scrollHeight: 4000 }),
    body: root.children[1],
    baseURI: "https://site.test/",
    addEventListener: (type: string, listener: unknown) => heard.set(type, listener),
    removeEventListener: (type: string, listener: unknown) => {
      if (heard.get(type) === listener) heard.delete(type);
    },
    styleSheets: [{ cssRules: rules.map((cssText) => ({ cssText })) }],
    defaultView: view,
    implementation: { createHTMLDocument: () => inert },
    createElement: () => {
      const probe = new Probe(doc, loaded);
      probes.push(probe);
      return probe;
    },
    querySelector: (selector: string) => root.querySelector(selector),
    querySelectorAll: (selector: string) => root.querySelectorAll(selector),
  };
  const frame = { contentDocument: doc, contentWindow: view } as unknown as HTMLIFrameElement;
  return { frame, probes, doc, heard };
}

/** The copy's element that stands for `node` of the page, found by its id. */
function copyOf(id: string): Node | undefined {
  return serialized?.all().find((node) => node.getAttribute("id") === id);
}

/** The band in these tests: 100 css px of the document under the viewport. */
const BAND = 100;

/** The plain request `plain` comes, and the request with CORS that follows, the last of `probes`, fails: its host refused CORS. */
function refuseCors(probes: Probe[], plain: Probe | undefined): void {
  expect(plain?.crossOrigin).toBeNull();
  for (const come of plain?.heard ?? []) come();
  const probe = probes.at(-1);
  expect([probe?.currentSrc, probe?.crossOrigin]).toEqual([plain?.currentSrc, "anonymous"]);
  for (const fail of probe?.failed ?? []) fail();
}

/** The plain request `plain` fails: the file is missing. */
function failPlain(plain: Probe | undefined): void {
  expect(plain?.crossOrigin).toBeNull();
  for (const fail of plain?.failed ?? []) fail();
}

/** The addresses asked for with CORS. */
function corsAsked(probes: Probe[]): string[] {
  return probes.filter((probe) => probe.crossOrigin === "anonymous").map((probe) => probe.currentSrc);
}

describe("pictureOf, with pictures near the band", () => {
  test("a picture straddling the viewport's bottom edge is in the copy as its own px, at the size it lays out at", () => {
    const hero = new Picture("https://site.test/hero.jpg", 1600, 1200).at(0, 600, 400, 300);
    hero.setAttribute("id", "hero");
    hero.setAttribute("srcset", "hero@2x.jpg 2x");
    const { frame } = frameOf([hero]);
    expect(pictureOf(frame, BAND)).not.toBeNull();
    // Read at what the box shows at the phone's 3 device px, not at the 1600 px it has.
    const data = "data:image/webp;base64,https://site.test/hero.jpg@1200x900";
    expect(copyOf("hero")?.getAttribute("src")).toBe(sizedPicture(data, 1600, 1200));
    expect(copyOf("hero")?.hasAttribute("srcset")).toBe(false);
    // Laid out as large as the page's, the data stretched over it.
    expect(decodeURIComponent(sizedPicture(data, 1600, 1200))).toBe(
      'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200" preserveAspectRatio="none">' +
        `<image href="${data}" width="1600" height="1200" preserveAspectRatio="none"/></svg>`,
    );
  });

  test("a background picture near the band is in the copy's style, its gradient kept", () => {
    const card = new Node("div", { id: "card" }).at(0, 650, 400, 200).styled({
      backgroundImage: 'linear-gradient(red, blue), url("https://site.test/paper.png")',
    });
    const loaded = new Map([["https://site.test/paper.png", { width: 64, height: 64 }]]);
    const { frame } = frameOf([card], loaded);
    pictureOf(frame, BAND);
    const picture = sizedPicture("data:image/webp;base64,https://site.test/paper.png@64x64", 64, 64);
    expect(copyOf("card")?.getAttribute("style")).toBe(`;background-image:linear-gradient(red, blue), url("${picture}") !important`);
  });

  test("a drawing under the band is in the copy as what it shows now, fitted as the page fits it", () => {
    const chart = Object.assign(new Drawing(800, 80), { label: "chart" }).at(0, 720, 400, 40);
    chart.setAttribute("id", "chart");
    const { frame } = frameOf([chart]);
    pictureOf(frame, BAND);
    const picture = sizedPicture("data:image/webp;base64,chart@800x80", 800, 80);
    expect(copyOf("chart")?.getAttribute("style")).toBe(
      `;background-image:url("${picture}") !important;background-size:100% 100% !important;` +
        "background-position:50% 50% !important;background-repeat:no-repeat !important;background-origin:content-box !important",
    );
  });

  test("a picture from another origin the frame may not read stays blank in the copy and is drawn over it, in its box", () => {
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 400, true).at(0, 700, 400, 200);
    away.setAttribute("id", "away");
    const { frame } = frameOf([away]);
    const picture = pictureOf(frame, BAND);
    expect(copyOf("away")?.getAttribute("src")).toBe(blankUrl(800, 400));
    const overlay = picture?.overlay;
    expect(overlay?.span).toEqual(bandSpan(0, 700, BAND));
    // Over the span, at the host's 2 device px, the document's top at the span's.
    const canvas = overlay?.canvas as unknown as Canvas;
    expect([canvas.width, canvas.height]).toEqual([800, 2 * (overlay?.span.bottom ?? 0)]);
    // Drawn whole on a canvas of its own first, then from it into its box, the canvas let go of after.
    const [source, ...place] = (canvas.calls.find(([name]) => name === "drawImage")?.[1] ?? []) as [Canvas, ...number[]];
    expect(source.drawn).toEqual([away]);
    expect(place).toEqual([0, 0, 800, 400, 0, 700, 400, 200]);
    expect([source.width, source.height]).toEqual([0, 0]);
  });

  test("a picture from another origin picked from a set by density is cut by its px, not by its size as made", () => {
    // 1000 px picked for a 400 px box at the phone's 3: its size as made is 400 by 225.
    const away = new Picture("https://cdn.other.test/x-1000.jpg", 400, 225, true).at(0, 700, 400, 225);
    away.setAttribute("srcset", "https://cdn.other.test/x-1000.jpg 1000w");
    const { frame } = frameOf([away]);
    const canvas = pictureOf(frame, BAND)?.overlay?.canvas as unknown as Canvas;
    const [source, ...place] = (canvas.calls.find(([name]) => name === "drawImage")?.[1] ?? []) as [Canvas, ...number[]];
    expect(source.drawn).toEqual([away]);
    // Read at the device's px, and cut as many of them for each px as made.
    expect(source.calls.find(([name]) => name === "drawImage")?.[1]).toEqual([away, 0, 0, 1200, 675]);
    expect(place).toEqual([0, 0, 1200, 675, 0, 700, 400, 225]);
  });

  test("one drawn over the copy is cut off where what holds it cuts it off, at its round corners", () => {
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 400, true).at(-6, 694, 412, 212);
    const holder = new Node("span", {}, [away]).at(0, 700, 400, 200).styled({ overflowX: "clip", overflowY: "clip", borderTopLeftRadius: "16px" });
    const { frame } = frameOf([holder]);
    const canvas = pictureOf(frame, BAND)?.overlay?.canvas as unknown as Canvas;
    const names = canvas.calls.map(([name]) => name);
    expect(names.slice(names.indexOf("save"), names.indexOf("drawImage") + 1)).toEqual(["save", "beginPath", "roundRect", "clip", "save", "drawImage"]);
    expect(canvas.calls.find(([name]) => name === "roundRect")?.[1]).toEqual([0, 700, 400, 200, 16]);
  });

  test("a page with nothing it cannot read has no overlay", () => {
    const hero = new Picture("https://site.test/hero.jpg", 1600, 1200).at(0, 600, 400, 300);
    const { frame } = frameOf([hero]);
    expect(pictureOf(frame, BAND)?.overlay).toBeNull();
  });

  test("a picture read once is kept: a picture taken again reads it no more, while a drawing is read each time", () => {
    const hero = new Picture("https://site.test/hero.jpg", 1600, 1200).at(0, 600, 400, 300);
    const chart = Object.assign(new Drawing(800, 80), { label: "chart" }).at(0, 720, 400, 40);
    const { frame } = frameOf([hero, chart]);
    pictureOf(frame, BAND);
    pictureOf(frame, BAND);
    expect(Canvas.reads.get("https://site.test/hero.jpg")).toBe(1);
    expect(Canvas.reads.get("chart")).toBe(2);
  });

  test("pictures far from the band, and those pinned to the screen, are not read and stay blank", () => {
    const far = new Picture("https://site.test/far.jpg", 800, 600).at(0, 3000, 400, 300);
    far.setAttribute("id", "far");
    const pin = new Picture("https://site.test/pin.png", 40, 40).at(0, 650, 40, 40);
    const bar = new Node("nav", { id: "bar" }, [pin]).at(0, 650, 400, 50).styled({ position: "fixed" });
    const { frame } = frameOf([far, bar]);
    const picture = pictureOf(frame, BAND);
    expect(copyOf("far")?.getAttribute("src")).toBe(blankUrl(800, 600));
    expect(Canvas.reads.size).toBe(0);
    // What is pinned is left out of the copy whole.
    expect(copyOf("bar")).toBeUndefined();
    expect(picture?.span).toEqual({ top: 0, bottom: 1500 });
  });

  test("scrolled on, the pictures read are those near the band there", () => {
    VIEW.scrollY = 2400;
    const far = new Picture("https://site.test/far.jpg", 800, 600).at(0, 3000, 400, 300);
    far.setAttribute("id", "far");
    const { frame } = frameOf([far]);
    pictureOf(frame, BAND);
    expect(copyOf("far")?.getAttribute("src")).toBe(sizedPicture("data:image/webp;base64,https://site.test/far.jpg@800x600", 800, 600));
  });

  test("a background picture the page has not loaded yet tells when it comes", () => {
    const card = new Node("div", { id: "card" }).at(0, 650, 400, 200).styled({ backgroundImage: 'url("https://site.test/late.png")' });
    const { frame, probes } = frameOf([card]);
    let heard = 0;
    pictureOf(frame, BAND, () => heard++);
    expect(copyOf("card")?.hasAttribute("style")).toBe(false);
    for (const listener of probes[0]?.heard ?? []) listener();
    expect(heard).toBe(1);
  });

  test("a page with no pictures does not need a new picture as it scrolls, its fonts as data none either", () => {
    const font = '@font-face { font-family: "a"; src: url("data:font/woff2;base64,AA") }';
    const { frame } = frameOf([new Node("p").at(0, 0, 400, 20)], undefined, [font]);
    expect(pictureOf(frame, BAND)?.span).toBeNull();
    const { frame: pictured } = frameOf([new Node("p").at(0, 0, 400, 20)], undefined, ['.a { background: url("/far.png") }']);
    expect(pictureOf(pictured, BAND)?.span).toEqual(bandSpan(0, 700, BAND));
  });
});

describe("pictureOf, with pictures the frame may not read as they are", () => {
  test("one from another origin that allows CORS is read through a picture asked for with it, with nothing drawn over the copy", () => {
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 400, true).at(0, 700, 400, 200);
    away.setAttribute("id", "away");
    const { frame, probes } = frameOf([away], new Map([["https://cdn.other.test/x.jpg", { width: 800, height: 400 }]]));
    const picture = pictureOf(frame, BAND);
    // Its origin has not allowed CORS yet, so it is asked for without first, which the browser has at once.
    expect(probes.map((probe) => probe.crossOrigin)).toEqual([null, "anonymous"]);
    expect(copyOf("away")?.getAttribute("src")).toBe(sizedPicture("data:image/webp;base64,https://cdn.other.test/x.jpg@800x400", 800, 400));
    expect(picture?.overlay).toBeNull();
  });

  test("an address of another origin shown as a picture and as a background picture at one size is read with CORS for both", () => {
    const address = "https://cdn.other.test/both.jpg";
    const away = new Picture(address, 800, 400, true).at(0, 650, 400, 200);
    const hero = new Node("div", { id: "hero" }).at(0, 850, 400, 200).styled({ backgroundImage: `url("${address}")` });
    const { frame, probes } = frameOf([away, hero], new Map([[address, { width: 800, height: 400 }]]));
    pictureOf(frame, BAND);
    expect(probes.length).toBe(1);
    const picture = sizedPicture(`data:image/webp;base64,${address}@800x400`, 800, 400);
    expect(copyOf("hero")?.getAttribute("style")).toBe(`;background-image:url("${picture}") !important`);
    expect(Canvas.reads.get(address)).toBe(1);
  });

  test("a background picture the frame may not read stays as it is, with nothing drawn over the copy", () => {
    const hero = new Node("div", { id: "hero" }).at(0, 650, 400, 300).styled({ backgroundImage: 'url("https://cdn.other.test/bg.png")' });
    const loaded = new Map([["https://cdn.other.test/bg.png", { width: 400, height: 300, tainted: true }]]);
    const { frame, probes } = frameOf([hero], loaded);
    const picture = pictureOf(frame, BAND);
    expect(probes[0]?.crossOrigin).toBe("anonymous");
    expect(copyOf("hero")?.hasAttribute("style")).toBe(false);
    expect(picture?.overlay).toBeNull();
  });

  test("a caption laid over a picture the frame may not read is drawn back over it, from a drawing of the copy with all else hidden", () => {
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 600, true).at(0, 650, 400, 300);
    const caption = new Node("h1", { id: "caption" }).at(24, 750, 352, 60);
    const { frame } = frameOf([new Node("div", {}, [away, caption]).at(0, 650, 400, 300)]);
    const overlay = pictureOf(frame, BAND)?.overlay;
    expect((overlay?.canvas as unknown as Canvas).calls.some(([name]) => name === "drawImage")).toBe(true);
    expect(overlay?.above?.parts.map((part) => part.rect)).toEqual([{ left: 0, top: 650, width: 400, height: 300 }]);
    // The last copy serialized is that drawing's: the root hidden, the caption shown.
    expect(serialized?.getAttribute("style")).toEndWith(";visibility:hidden !important");
    expect(copyOf("caption")?.getAttribute("style")).toBe(";visibility:visible !important");
    expect(decodeURIComponent(overlay?.above?.src ?? "")).toContain('id="caption" style=";visibility:visible !important"');
    // One off it, or hidden, has nothing drawn back.
    caption.at(24, 960, 352, 60);
    expect(pictureOf(frame, BAND)?.overlay?.above).toBeNull();
    caption.at(24, 750, 352, 60).shown = false;
    expect(pictureOf(frame, BAND)?.overlay?.above).toBeNull();
  });

  test("what paints under a picture the frame may not read is not drawn back over it: earlier in the flow, or stacked below", () => {
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 600, true).at(0, 650, 400, 300);
    const before = new Node("h1").at(24, 750, 352, 60);
    const below = new Node("span").at(24, 820, 100, 40).styled({ position: "absolute", zIndex: "-1" });
    const { frame } = frameOf([new Node("div", {}, [before, away, below]).at(0, 650, 400, 300)]);
    expect(pictureOf(frame, BAND)?.overlay?.above).toBeNull();
    // Positioned, one earlier paints over a picture in the flow.
    before.styled({ position: "relative" });
    expect(pictureOf(frame, BAND)?.overlay?.above).not.toBeNull();
  });

  test("drawn back, the drawing goes over each covered picture only, cut off as the picture is", () => {
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 400, true).at(-6, 694, 412, 212);
    const holder = new Node("span", {}, [away, new Node("b").at(300, 860, 40, 40).styled({ position: "absolute" })])
      .at(0, 700, 400, 200)
      .styled({ overflowX: "clip", overflowY: "clip", borderTopLeftRadius: "28px" });
    const { frame } = frameOf([holder]);
    const overlay = pictureOf(frame, BAND)?.overlay;
    if (!overlay) throw new Error("no overlay");
    const canvas = overlay.canvas as unknown as Canvas;
    const drawn = canvas.calls.length;
    const image = { label: "above" } as unknown as CanvasImageSource;
    const span = overlay.span;
    const tall = span.bottom - span.top;
    // Drawn once on a canvas as large as the overlay, over the same stretch.
    const raised = raiseOf(overlay, image) as unknown as Canvas;
    expect([raised.width, raised.height]).toEqual([canvas.width, canvas.height]);
    expect(raised.calls.find(([name]) => name === "drawImage")?.[1]).toEqual([image, 0, span.top, 400, tall, 0, span.top, 400, tall]);
    drawAbove(overlay, raised as unknown as CanvasImageSource);
    expect(canvas.calls.slice(drawn)).toEqual([
      ["setTransform", [2, 0, 0, 2, 0, -span.top * 2]],
      ["save", []],
      ["beginPath", []],
      ["roundRect", [0, 700, 400, 200, 28]],
      ["clip", []],
      ["beginPath", []],
      ["rect", [-6, 694, 412, 212]],
      ["clip", []],
      ["drawImage", [raised, 0, span.top, 400, tall]],
      ["restore", []],
    ]);
  });

  test("a hidden picture the frame may not read, as a fading carousel has, is not drawn", () => {
    const shown = new Picture("https://cdn.other.test/a.jpg", 800, 600, true).at(0, 650, 400, 300);
    const faded = new Picture("https://cdn.other.test/b.jpg", 800, 600, true).at(0, 650, 400, 300);
    faded.shown = false;
    const { frame } = frameOf([new Node("div", {}, [shown, faded]).at(0, 650, 400, 300)]);
    const canvas = pictureOf(frame, BAND)?.overlay?.canvas as unknown as Canvas;
    const sources = canvas.calls.filter(([name]) => name === "drawImage").map(([, args]) => (args[0] as Canvas).drawn);
    expect(sources).toEqual([[shown]]);
  });

  test("the body and the root, cutting off what overflows them, cut off none of what is drawn over the copy", () => {
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 400, true).at(0, 700, 400, 200);
    const { frame, doc } = frameOf([away]);
    doc.body?.styled({ overflowX: "hidden" });
    doc.documentElement.styled({ overflowX: "hidden", overflowY: "hidden" });
    const canvas = pictureOf(frame, BAND)?.overlay?.canvas as unknown as Canvas;
    const names = canvas.calls.map(([name]) => name);
    expect(names).toContain("drawImage");
    expect(names).not.toContain("roundRect");
  });

  test("with many background pictures near the band, a picture taken again asks for and reads none of them again", () => {
    const loaded = new Map<string, { width: number; height: number }>();
    const rows = Array.from({ length: 70 }, (_, at) => {
      const address = `https://site.test/t.png?i=${at}`;
      loaded.set(address, { width: 40, height: 20 });
      return new Node("div").at(0, at * 20, 400, 20).styled({ backgroundImage: `url("${address}")` });
    });
    const { frame, probes } = frameOf(rows, loaded);
    pictureOf(frame, BAND);
    pictureOf(frame, BAND);
    expect(probes.length).toBe(70);
    // Each had its picture at once, so none waits to tell it came.
    expect(probes.every((probe) => probe.heard.length === 0)).toBe(true);
    expect([...Canvas.reads.values()].every((count) => count === 1)).toBe(true);
    expect(Canvas.reads.size).toBe(70);
  });
});

describe("pictureOf, with videos near the band", () => {
  /** What a copy of a video fitted as `contain` shows, `data` stretched over `width` by `height` px. */
  const shows = (data: string, width: number, height: number) =>
    `;background-image:url("${sizedPicture(data, width, height)}") !important;background-size:contain !important;` +
    "background-position:50% 50% !important;background-repeat:no-repeat !important;background-origin:content-box !important";

  test("a paused video the frame may read is in the copy as its frame now, sized as its frame, and read again each picture", () => {
    const clip = new Video("https://site.test/clip.mp4", 1080, 1920).at(0, 650, 400, 300).styled({ objectFit: "contain" });
    clip.paused = true;
    clip.setAttribute("id", "clip");
    const { frame } = frameOf([clip]);
    const picture = pictureOf(frame, BAND);
    expect(copyOf("clip")?.getAttribute("style")).toBe(shows("data:image/webp;base64,https://site.test/clip.mp4@1080x1920", 1080, 1920));
    expect([copyOf("clip")?.getAttribute("width"), copyOf("clip")?.getAttribute("height")]).toEqual(["1080", "1920"]);
    expect(picture?.overlay).toBeNull();
    pictureOf(frame, BAND);
    expect(Canvas.reads.get("https://site.test/clip.mp4")).toBe(2);
  });

  test("a video that plays is drawn over the copy, read or not, to draw again at each of its frames, and nothing is read of it", () => {
    const clip = new Video("https://site.test/clip.mp4", 1080, 1920).at(0, 650, 400, 300).styled({ objectFit: "contain" });
    clip.setAttribute("id", "clip");
    const { frame } = frameOf([clip]);
    const overlay = pictureOf(frame, BAND)?.overlay;
    expect((overlay?.canvas as unknown as Canvas).drawn).toEqual([clip]);
    expect(overlay?.live.map((one) => one.live)).toEqual([clip as unknown as HTMLVideoElement]);
    expect(copyOf("clip")?.hasAttribute("style")).toBe(false);
    expect(Canvas.reads.has("https://site.test/clip.mp4")).toBe(false);
  });

  test("a video from another origin the frame may not read is drawn over the copy as its frame now, in its box", () => {
    const clip = new Video("https://media.other.test/clip.mp4", 1080, 1920, true).at(0, 650, 400, 300).styled({ objectFit: "contain" });
    clip.setAttribute("id", "clip");
    const { frame } = frameOf([clip]);
    const canvas = pictureOf(frame, BAND)?.overlay?.canvas as unknown as Canvas;
    expect(canvas.drawn).toEqual([clip]);
    expect(copyOf("clip")?.hasAttribute("style")).toBe(false);
  });

  test("a video scaled by css is drawn over the copy in the box it shows in, scaled, and fitted there as the page fits it", () => {
    // 400 by 300 laid out, at `scale: 1.1` from its middle: its box shows 440 by 330, 20 px out each side and 15 up.
    const clip = new Video("https://media.other.test/clip.mp4", 1080, 1920, true).at(-20, 635, 440, 330).styled({ objectFit: "cover", scale: "1.1" });
    const { frame } = frameOf([clip]);
    const canvas = pictureOf(frame, BAND)?.overlay?.canvas as unknown as Canvas;
    // Cover: the middle 1080 by 810 of the frame, over the whole scaled box.
    expect(canvas.calls.find(([name]) => name === "drawImage")?.[1]).toEqual([clip, 0, 555, 1080, 810, -20, 635, 440, 330]);
  });

  test("a video the frame may not read, under a sound button, is drawn over the copy and the button drawn back over it", () => {
    const clip = new Video("https://media.other.test/clip.mp4", 1080, 1920, true).at(17, 2410, 368, 654).styled({ objectFit: "contain" });
    const media = new Node("button", { class: "media" }, [clip]).at(17, 2410, 368, 654).styled({ overflowX: "clip", overflowY: "clip", borderTopLeftRadius: "28px" });
    const sound = new Node("button", { id: "sound" }).at(330, 3010, 44, 44).styled({ position: "absolute" });
    const { frame } = frameOf([new Node("p", {}, [media, new Node("span", {}, [sound]).at(0, 3064, 400, 0)]).at(17, 2410, 368, 654)]);
    VIEW.scrollY = 2000;
    const overlay = pictureOf(frame, BAND)?.overlay;
    expect((overlay?.canvas as unknown as Canvas).drawn).toEqual([clip]);
    expect(overlay?.above?.parts.map(({ rect, clip }) => ({ rect, clip }))).toEqual([
      { rect: { left: 17, top: 2410, width: 368, height: 654 }, clip: { rect: { left: 17, top: 2410, width: 368, height: 654 }, radius: 28 } },
    ]);
    expect(copyOf("sound")?.getAttribute("style")).toBe(";visibility:visible !important");
  });

  test("a video with no frame yet is in the copy as its poster, read as a picture of the page's origin is, sized as the poster", () => {
    const clip = new Video("https://site.test/clip.mp4", 1080, 1920, false, "https://site.test/still.webp").unready().at(0, 650, 400, 300).styled({ objectFit: "contain" });
    clip.setAttribute("id", "clip");
    const { frame, probes } = frameOf([clip], new Map([["https://site.test/still.webp", { width: 540, height: 960 }]]));
    const picture = pictureOf(frame, BAND);
    // Same origin: asked for without CORS, once.
    expect(probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([["https://site.test/still.webp", null]]);
    expect(copyOf("clip")?.getAttribute("style")).toBe(shows("data:image/webp;base64,https://site.test/still.webp@540x960", 540, 960));
    expect([copyOf("clip")?.getAttribute("width"), copyOf("clip")?.getAttribute("height")]).toEqual(["540", "960"]);
    expect(picture?.overlay).toBeNull();
    // Kept as a picture is: a picture taken again reads it no more.
    pictureOf(frame, BAND);
    expect(Canvas.reads.get("https://site.test/still.webp")).toBe(1);
  });

  test("a video that has a frame but has not played shows its poster; one with none shows nothing to read", () => {
    const clip = new Video("https://site.test/clip.mp4", 1080, 1920, false, "https://site.test/still.webp").at(0, 650, 400, 300).styled({ objectFit: "contain" });
    Object.assign(clip, { paused: true, currentTime: 0, played: { length: 0 } });
    clip.setAttribute("id", "clip");
    const blank = new Video("https://site.test/blank.mp4", 1080, 1920).unready().at(0, 960, 400, 100);
    blank.setAttribute("id", "blank");
    const { frame } = frameOf([clip, blank], new Map([["https://site.test/still.webp", { width: 540, height: 960 }]]));
    expect(pictureOf(frame, BAND)?.overlay).toBeNull();
    // As large as its frame, which the page lays it out by, the poster fitted in it.
    expect(copyOf("clip")?.getAttribute("style")).toBe(shows("data:image/webp;base64,https://site.test/still.webp@540x960", 540, 960));
    expect(copyOf("clip")?.getAttribute("width")).toBe("1080");
    expect(copyOf("blank")?.hasAttribute("style")).toBe(false);
    expect(Canvas.reads.has("https://site.test/blank.mp4")).toBe(false);
  });

  test("a poster of another origin that refuses CORS is asked for without it first, then with it, and drawn over the copy from the plain one", () => {
    const address = "https://quiet-p.test/still.webp";
    const clip = new Video("https://quiet-p.test/clip.mp4", 1080, 1920, true, address).unready().at(0, 650, 400, 300).styled({ objectFit: "contain" });
    clip.setAttribute("id", "clip");
    const { frame, probes } = frameOf([clip], new Map<string, Loaded>([[address, { width: 540, height: 960, tainted: true, cors: false }]]));
    const first = pictureOf(frame, BAND)?.overlay?.canvas as unknown as Canvas;
    // Plain first, then with CORS, which waits on the host; the plain one the page has draws now.
    expect(probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      [address, null],
      [address, "anonymous"],
      [address, null],
    ]);
    expect(first.drawn).toEqual([probes[2]]);
    for (const fail of probes[1]?.failed ?? []) fail();
    const again = pictureOf(frame, BAND)?.overlay?.canvas as unknown as Canvas;
    // Refused: asked for no more, the plain one kept and drawn again.
    expect(probes.length).toBe(3);
    expect(corsAsked(probes)).toEqual([address]);
    expect(again.drawn).toEqual([probes[2]]);
    expect(copyOf("clip")?.hasAttribute("style")).toBe(false);
  });
});

describe("pictureOf, of a page whose root or body has an overflow of its own", () => {
  test("a body at 100% that cuts off its sides, whose overflow the viewport takes, lays out whole in the copy, as the page shows it", () => {
    const { frame, doc } = frameOf([new Node("p").at(0, 900, 400, 20)]);
    // Cutting off one way only, it computes as auto the other way: a scroll container in a drawing.
    doc.body?.styled({ overflowX: "hidden", overflowY: "auto" });
    pictureOf(frame, BAND);
    expect(serialized?.querySelector("body")?.getAttribute("style")).toBe(";overflow:visible !important");
    expect(serialized?.getAttribute("style")).not.toContain("overflow");
  });

  test("a root that cuts off its sides gives the viewport its overflow, and its copy is visible, its body left as the page has it", () => {
    const { frame, doc } = frameOf([new Node("p").at(0, 900, 400, 20)]);
    doc.documentElement.styled({ overflowX: "hidden", overflowY: "auto" });
    doc.body?.styled({ overflowX: "hidden", overflowY: "auto" });
    pictureOf(frame, BAND);
    expect(serialized?.getAttribute("style")).toStartWith(";overflow:visible !important;");
    // The body keeps its own, as the page's does: a page that scrolls in its body has it laid out whole another way.
    expect(serialized?.querySelector("body")?.getAttribute("style") ?? "").not.toContain("overflow:visible !important;");
  });

  test("a page that sets no overflow has a copy with none set", () => {
    const { frame } = frameOf([new Node("p").at(0, 900, 400, 20)]);
    pictureOf(frame, BAND);
    expect(serialized?.querySelector("body")?.hasAttribute("style")).toBe(false);
    expect(serialized?.getAttribute("style")).not.toContain("overflow");
  });
});

describe("pictureOf, of a page that scrolls in its body", () => {
  /** A page whose root cuts off and whose body, as tall as the viewport, scrolls 600 px down `height` px of content. */
  function scrolledBody(body: Node[], height = 3000) {
    const page = frameOf(body);
    page.doc.documentElement.styled({ overflowX: "hidden", overflowY: "hidden" });
    page.doc.documentElement.scrollHeight = 700;
    const scroller = page.doc.body;
    if (!scroller) throw new Error("no body");
    scroller.styled({ display: "block", overflowX: "auto", overflowY: "auto" }).at(0, 0, 400, 700);
    scroller.scrollHeight = height;
    scroller.scrollTop = 600;
    return { ...page, scroller };
  }

  test("is scrolled as far as its body is, which lays out whole in the copy, cut off at its sides only", () => {
    // A picture far down, so the page has pictures to read as it scrolls.
    const { frame, doc, scroller } = scrolledBody([new Picture("https://site.test/far.jpg", 800, 400).at(0, 2800, 400, 200)]);
    expect(bodyScroller(doc as unknown as Document, frame.contentWindow as Window)).toBe(scroller as unknown as HTMLElement);
    expect(scrollOf(doc as unknown as Document, frame.contentWindow as Window)).toBe(600);
    const picture = pictureOf(frame, BAND);
    expect(picture?.span).toEqual(bandSpan(600, 700, BAND));
    // As tall as what the body holds, not as the document, which does not scroll.
    expect(picture?.height).toBe(3000);
    expect(serialized?.querySelector("body")?.getAttribute("style")).toBe(
      ";overflow-x:clip !important;overflow-y:visible !important;display:flow-root !important",
    );
  });

  test("a body whose overflow the viewport takes does not scroll in it: the document does", () => {
    const { frame, doc } = frameOf([]);
    doc.body?.styled({ overflowX: "hidden", overflowY: "auto" });
    expect(bodyScroller(doc as unknown as Document, frame.contentWindow as Window)).toBeNull();
  });

  test("the pictures read are those near the band in the body as scrolled", () => {
    const near = new Picture("https://site.test/near.jpg", 800, 400).at(0, 1300, 400, 200);
    near.setAttribute("id", "near");
    const { frame } = scrolledBody([near]);
    pictureOf(frame, BAND);
    expect(copyOf("near")?.getAttribute("src")).toBe(sizedPicture("data:image/webp;base64,https://site.test/near.jpg@800x400", 800, 400));
  });

  test("the band follows the body's scroll, which only the document hears of", async () => {
    const { frame, heard, scroller } = scrolledBody([]);
    const { image } = await shownBand(frame);
    // Half the page's px: the band starts 1300 px down the body's content.
    expect(image()?.style.transform).toBe("translate3d(0, -650px, 0)");
    scroller.scrollTop = 800;
    const onScroll = heard.get("scroll") as (event: { target: unknown }) => void;
    onScroll({ target: new Node("div") });
    expect(image()?.style.transform).toBe("translate3d(0, -650px, 0)");
    onScroll({ target: scroller });
    expect(image()?.style.transform).toBe("translate3d(0, -750px, 0)");
  });
});

describe("pictureOf, asking for pictures quietly", () => {
  test("a same-origin background picture is asked for without CORS, one from another origin without it first, then with it once it came", () => {
    const own = new Node("div").at(0, 650, 400, 100).styled({ backgroundImage: 'url("https://site.test/own.png")' });
    const away = new Node("div").at(0, 760, 400, 100).styled({ backgroundImage: 'url("https://quiet-a.test/away.png")' });
    const { frame, probes } = frameOf([own, away]);
    pictureOf(frame, BAND);
    expect(probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://site.test/own.png", null],
      ["https://quiet-a.test/away.png", null],
    ]);
    for (const come of probes[1]?.heard ?? []) come();
    expect(probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://site.test/own.png", null],
      ["https://quiet-a.test/away.png", null],
      ["https://quiet-a.test/away.png", "anonymous"],
    ]);
  });

  test("a missing file is asked for once only, without CORS, in this document or the next", () => {
    const row = () => new Node("div").at(0, 650, 400, 100).styled({ backgroundImage: 'url("https://quiet-j.test/gone.png")' });
    const first = frameOf([row()]);
    let heard = 0;
    pictureOf(first.frame, BAND, () => heard++);
    failPlain(first.probes[0]);
    // Its origin's others may be asked for now, so a new picture is taken.
    expect(heard).toBe(1);
    pictureOf(first.frame, BAND);
    const next = frameOf([row()]);
    pictureOf(next.frame, BAND);
    expect(first.probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([["https://quiet-j.test/gone.png", null]]);
    expect(next.probes.length).toBe(0);
  });

  test("a file the page has, whose host refuses CORS, is asked for without it, then with it, and counts against its host, which two such stop", () => {
    const rows = () => [1, 2, 3].map((at) => new Node("div").at(0, 600 + at * 50, 400, 50).styled({ backgroundImage: `url("https://quiet-k.test/${at}.png")` }));
    const loaded = new Map<string, Loaded>([1, 2, 3].map((at) => [`https://quiet-k.test/${at}.png`, { width: 400, height: 50, cors: false }]));
    const { frame, probes } = frameOf(rows(), loaded);
    let heard = 0;
    pictureOf(frame, BAND, () => heard++);
    // Without CORS the browser has it at once, from the page; with CORS it goes to the host, and the origin's others wait on it.
    expect(probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://quiet-k.test/1.png", null],
      ["https://quiet-k.test/1.png", "anonymous"],
    ]);
    pictureOf(frame, BAND);
    expect(probes.length).toBe(2);
    for (const fail of probes[1]?.failed ?? []) fail();
    expect(heard).toBe(1);
    pictureOf(frame, BAND);
    expect(probes.slice(2).map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://quiet-k.test/2.png", null],
      ["https://quiet-k.test/2.png", "anonymous"],
    ]);
    for (const fail of probes[3]?.failed ?? []) fail();
    pictureOf(frame, BAND);
    // Two refused, so the third is asked for neither way, in this document or the next.
    expect(probes.length).toBe(4);
    const next = frameOf(rows(), loaded);
    pictureOf(next.frame, BAND);
    expect(next.probes.length).toBe(0);
  });

  test("an address that failed to come with CORS is asked for no more, in this document or the next", () => {
    const away = () => new Picture("https://quiet-b.test/x.jpg", 800, 400, true).at(0, 700, 400, 200);
    const first = frameOf([away()]);
    pictureOf(first.frame, BAND);
    expect(first.probes.length).toBe(1);
    refuseCors(first.probes, first.probes[0]);
    pictureOf(first.frame, BAND);
    expect(first.probes.length).toBe(2);
    expect(corsAsked(first.probes)).toEqual(["https://quiet-b.test/x.jpg"]);
    const next = frameOf([away()]);
    const picture = pictureOf(next.frame, BAND);
    expect(next.probes.length).toBe(0);
    // It is still drawn over the copy.
    expect(picture?.overlay).not.toBeNull();
  });

  test("an origin is asked for one address at a time till it allows CORS, and for none once two of the page's pictures failed", () => {
    const rows = [1, 2, 3].map((at) => new Picture(`https://quiet-c.test/${at}.png`, 400, 50, true).at(0, 600 + at * 50, 400, 50));
    const { frame, probes } = frameOf(rows);
    pictureOf(frame, BAND);
    expect(probes.map((probe) => probe.currentSrc)).toEqual(["https://quiet-c.test/1.png"]);
    for (const come of probes[0]?.heard ?? []) come();
    // Till its request with CORS tells whether the host allows it, the origin's others wait.
    pictureOf(frame, BAND);
    expect(probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://quiet-c.test/1.png", null],
      ["https://quiet-c.test/1.png", "anonymous"],
    ]);
    for (const fail of probes[1]?.failed ?? []) fail();
    pictureOf(frame, BAND);
    expect(probes.at(-1)?.currentSrc).toBe("https://quiet-c.test/2.png");
    refuseCors(probes, probes.at(-1));
    pictureOf(frame, BAND);
    const next = frameOf(rows.map((row) => new Picture(row.src, 400, 50, true).at(row.box.left, row.box.top, row.box.width, row.box.height)));
    pictureOf(next.frame, BAND);
    expect(probes.length).toBe(4);
    expect(corsAsked(probes)).toEqual(["https://quiet-c.test/1.png", "https://quiet-c.test/2.png"]);
    expect(next.probes.length).toBe(0);
  });

  test("missing background pictures count against no origin: one with two missing still has its third read", () => {
    const rows = [1, 2, 3].map((at) =>
      new Node("div", { id: `row${at}` }).at(0, 600 + at * 50, 400, 50).styled({ backgroundImage: `url("https://quiet-e.test/${at}.png")` }),
    );
    const { frame, probes } = frameOf(rows, new Map([["https://quiet-e.test/3.png", { width: 400, height: 50 }]]));
    let heard = 0;
    pictureOf(frame, BAND, () => heard++);
    failPlain(probes[0]);
    // The next waited on it, so a new picture is taken to ask for it.
    expect(heard).toBe(1);
    pictureOf(frame, BAND);
    failPlain(probes.at(-1));
    pictureOf(frame, BAND);
    // Only the file that is there is asked for with CORS.
    expect(probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://quiet-e.test/1.png", null],
      ["https://quiet-e.test/2.png", null],
      ["https://quiet-e.test/3.png", null],
      ["https://quiet-e.test/3.png", "anonymous"],
    ]);
    const picture = sizedPicture("data:image/webp;base64,https://quiet-e.test/3.png@400x50", 400, 50);
    expect(copyOf("row3")?.getAttribute("style")).toBe(`;background-image:url("${picture}") !important`);
    // Each failed address is asked for once only.
    pictureOf(frame, BAND);
    expect(probes.length).toBe(4);
  });

  test("two background pictures that are there but fail CORS stop requests to their host, in this document and the next", () => {
    const rows = () => [1, 2, 3].map((at) => new Node("div").at(0, 600 + at * 50, 400, 50).styled({ backgroundImage: `url("https://quiet-g.test/${at}.png")` }));
    const { frame, probes } = frameOf(rows());
    pictureOf(frame, BAND);
    refuseCors(probes, probes[0]);
    pictureOf(frame, BAND);
    refuseCors(probes, probes.at(-1));
    pictureOf(frame, BAND);
    // The third is asked for neither way.
    expect(probes.length).toBe(4);
    expect(corsAsked(probes)).toEqual(["https://quiet-g.test/1.png", "https://quiet-g.test/2.png"]);
    const next = frameOf(rows());
    pictureOf(next.frame, BAND);
    expect(next.probes.length).toBe(0);
  });

  test("a missing file on a host that allows CORS does not keep its other addresses from being read", () => {
    const rows = [1, 2, 3].map((at) =>
      new Node("div", { id: `row${at}` }).at(0, 600 + at * 50, 400, 50).styled({ backgroundImage: `url("https://quiet-h.test/${at}.png")` }),
    );
    const loaded = new Map([2, 3].map((at) => [`https://quiet-h.test/${at}.png`, { width: 400, height: 50 }]));
    const { frame, probes } = frameOf(rows, loaded);
    pictureOf(frame, BAND);
    failPlain(probes[0]);
    pictureOf(frame, BAND);
    // 2.png comes at once both ways, so its origin allowed CORS, and 3.png is asked for with it only.
    expect(probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://quiet-h.test/1.png", null],
      ["https://quiet-h.test/2.png", null],
      ["https://quiet-h.test/2.png", "anonymous"],
      ["https://quiet-h.test/3.png", "anonymous"],
    ]);
    const picture = sizedPicture("data:image/webp;base64,https://quiet-h.test/3.png@400x50", 400, 50);
    expect(copyOf("row3")?.getAttribute("style")).toBe(`;background-image:url("${picture}") !important`);
  });

  test("pictures of the page follow the same rule: two missing count against no origin, its third is still read", () => {
    const rows = [1, 2, 3].map((at) => new Picture(`https://quiet-i.test/${at}.png`, 400, 50, true).at(0, 600 + at * 50, 400, 50));
    rows[2]?.setAttribute("id", "third");
    const { frame, probes } = frameOf(rows, new Map([["https://quiet-i.test/3.png", { width: 400, height: 50 }]]));
    pictureOf(frame, BAND);
    failPlain(probes[0]);
    pictureOf(frame, BAND);
    failPlain(probes.at(-1));
    pictureOf(frame, BAND);
    expect(probes.length).toBe(4);
    expect(corsAsked(probes)).toEqual(["https://quiet-i.test/3.png"]);
    expect(copyOf("third")?.getAttribute("src")).toBe(sizedPicture("data:image/webp;base64,https://quiet-i.test/3.png@400x50", 400, 50));
  });

  test("an origin that allowed CORS is asked for the rest of its pictures with it only, however many of them fail", () => {
    const page = (at: string, top: number) => new Picture(`https://quiet-f.test/${at}.jpg`, 400, 50, true).at(0, top, 400, 50);
    const loaded = new Map([
      ["https://quiet-f.test/a.jpg", { width: 400, height: 50 }],
      ["https://quiet-f.test/d.jpg", { width: 400, height: 50 }],
    ]);
    const first = frameOf([page("a", 650), page("b", 700), page("c", 750)], loaded);
    pictureOf(first.frame, BAND);
    // Only the first is asked for without CORS: it came with CORS at once, so the rest are asked for with it alone.
    expect(first.probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://quiet-f.test/a.jpg", null],
      ["https://quiet-f.test/a.jpg", "anonymous"],
      ["https://quiet-f.test/b.jpg", "anonymous"],
      ["https://quiet-f.test/c.jpg", "anonymous"],
    ]);
    for (const probe of first.probes) for (const fail of probe.failed) fail();
    const later = page("d", 700);
    later.setAttribute("id", "later");
    const next = frameOf([later], loaded);
    pictureOf(next.frame, BAND);
    expect(next.probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([["https://quiet-f.test/d.jpg", "anonymous"]]);
    expect(copyOf("later")?.getAttribute("src")).toBe(sizedPicture("data:image/webp;base64,https://quiet-f.test/d.jpg@400x50", 400, 50));
  });

  test("an origin that allowed CORS has the rest of its addresses asked for at once", () => {
    const rows = [1, 2, 3].map((at) =>
      new Node("div").at(0, 600 + at * 50, 400, 50).styled({ backgroundImage: `url("https://quiet-d.test/${at}.png")` }),
    );
    let heard = 0;
    const { frame, probes } = frameOf(rows);
    pictureOf(frame, BAND, () => heard++);
    expect(probes.length).toBe(1);
    for (const come of probes[0]?.heard ?? []) come();
    expect(heard).toBe(0);
    for (const come of probes[1]?.heard ?? []) come();
    expect(heard).toBe(1);
    pictureOf(frame, BAND);
    expect(probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://quiet-d.test/1.png", null],
      ["https://quiet-d.test/1.png", "anonymous"],
      ["https://quiet-d.test/2.png", "anonymous"],
      ["https://quiet-d.test/3.png", "anonymous"],
    ]);
  });

  test("a request of an old document that comes leaves alone the queue a new document's request holds", () => {
    const rows = () => [1, 2, 3].map((at) => new Node("div").at(0, 600 + at * 50, 400, 50).styled({ backgroundImage: `url("https://quiet-z.test/${at}.png")` }));
    const first = frameOf(rows());
    let heard = 0;
    pictureOf(first.frame, BAND, () => heard++);
    const next = frameOf(rows());
    pictureOf(next.frame, BAND);
    expect(next.probes.map((probe) => probe.currentSrc)).toEqual(["https://quiet-z.test/1.png"]);
    for (const come of first.probes[0]?.heard ?? []) come();
    pictureOf(next.frame, BAND);
    // The old document asks for nothing more and is told nothing; the new one's 2.png still waits on its 1.png.
    expect(first.probes.length).toBe(1);
    expect(heard).toBe(0);
    expect(next.probes.map((probe) => probe.currentSrc)).toEqual(["https://quiet-z.test/1.png"]);
    for (const come of next.probes[0]?.heard ?? []) come();
    expect(corsAsked(next.probes)).toEqual(["https://quiet-z.test/1.png"]);
  });

  test("a request of an old document that fails leaves alone the queue a new document's request holds", () => {
    const rows = () => [1, 2, 3].map((at) => new Node("div").at(0, 600 + at * 50, 400, 50).styled({ backgroundImage: `url("https://quiet-v.test/${at}.png")` }));
    const first = frameOf(rows());
    let heard = 0;
    pictureOf(first.frame, BAND, () => heard++);
    const next = frameOf(rows());
    pictureOf(next.frame, BAND);
    expect(next.probes.map((probe) => probe.currentSrc)).toEqual(["https://quiet-v.test/1.png"]);
    failPlain(first.probes[0]);
    pictureOf(next.frame, BAND);
    // The old document is told nothing; the new one's 2.png still waits on its 1.png.
    expect(heard).toBe(0);
    expect(next.probes.map((probe) => probe.currentSrc)).toEqual(["https://quiet-v.test/1.png"]);
  });

  test("a request that comes, where the browser has the file for a request with CORS too, tells at once", () => {
    const row = new Node("div").at(0, 650, 400, 50).styled({ backgroundImage: 'url("https://quiet-w.test/1.png")' });
    const loaded = new Map<string, Loaded>();
    const { frame, probes } = frameOf([row], loaded);
    let heard = 0;
    pictureOf(frame, BAND, () => heard++);
    expect(probes[0]?.complete).toBe(false);
    loaded.set("https://quiet-w.test/1.png", { width: 400, height: 50 });
    for (const come of probes[0]?.heard ?? []) come();
    expect(corsAsked(probes)).toEqual(["https://quiet-w.test/1.png"]);
    expect(probes.at(-1)?.complete).toBe(true);
    expect(heard).toBe(1);
  });

  test("a request with CORS of an old document that fails counts at once, but leaves alone the queue a new document's request holds", () => {
    const rows = () => [1, 2, 3].map((at) => new Node("div").at(0, 600 + at * 50, 400, 50).styled({ backgroundImage: `url("https://quiet-y.test/${at}.png")` }));
    const first = frameOf(rows());
    let heard = 0;
    pictureOf(first.frame, BAND, () => heard++);
    for (const come of first.probes[0]?.heard ?? []) come();
    expect(corsAsked(first.probes)).toEqual(["https://quiet-y.test/1.png"]);
    const next = frameOf(rows());
    let told = 0;
    pictureOf(next.frame, BAND, () => told++);
    for (const fail of first.probes[1]?.failed ?? []) fail();
    expect(heard).toBe(0);
    pictureOf(next.frame, BAND);
    expect(next.probes.map((probe) => probe.currentSrc)).toEqual(["https://quiet-y.test/1.png"]);
    // The new one's request comes, but its address was refused meanwhile, so it is not asked for with CORS, and the next may be asked for.
    for (const come of next.probes[0]?.heard ?? []) come();
    expect(told).toBe(1);
    pictureOf(next.frame, BAND);
    expect(next.probes.map((probe) => [probe.currentSrc, probe.crossOrigin])).toEqual([
      ["https://quiet-y.test/1.png", null],
      ["https://quiet-y.test/2.png", null],
    ]);
  });

  test("a request let go of by forgetPixels that comes leaves alone the queue of the requests after", () => {
    const rows = [1, 2, 3].map((at) => new Node("div").at(0, 600 + at * 50, 400, 50).styled({ backgroundImage: `url("https://quiet-x.test/${at}.png")` }));
    const { frame, probes } = frameOf(rows);
    let heard = 0;
    pictureOf(frame, BAND, () => heard++);
    forgetPixels();
    pictureOf(frame, BAND, () => heard++);
    expect(probes.map((probe) => probe.currentSrc)).toEqual(["https://quiet-x.test/1.png", "https://quiet-x.test/1.png"]);
    for (const come of probes[0]?.heard ?? []) come();
    // The old request asks for nothing with CORS and tells nothing; 2.png still waits on the new one.
    expect(heard).toBe(0);
    pictureOf(frame, BAND);
    expect(probes.length).toBe(2);
    for (const come of probes[1]?.heard ?? []) come();
    expect(corsAsked(probes)).toEqual(["https://quiet-x.test/1.png"]);
  });
});

describe("sameOrigin", () => {
  test("an address of the page's origin, relative or not, a blob of it too; not another's, nor data", () => {
    expect(sameOrigin("/a.png", "https://site.test/x/", "https://site.test")).toBe(true);
    expect(sameOrigin("blob:https://site.test/1234", "https://site.test/", "https://site.test")).toBe(true);
    expect(sameOrigin("https://cdn.site.test/a.png", "https://site.test/", "https://site.test")).toBe(false);
    expect(sameOrigin("data:image/png;base64,AA", "https://site.test/", "https://site.test")).toBe(false);
    expect(sameOrigin("http://[bad", "https://site.test/", "https://site.test")).toBe(false);
  });
});

/** The page's look, as the band takes its fill from. */
const LOOK: Look = {
  background: "rgb(255, 255, 255)",
  top: "rgb(255, 255, 255)",
  header: false,
  bottom: "rgb(255, 255, 255)",
  footer: false,
  under: [],
  dark: false,
  scheme: "light",
  host: "",
  canBack: false,
  canForward: false,
};

/** The band in the screen's css px: half as wide as the page's 400, so 100 of the document's px tall. */
const RECT = { x: 0, y: 776, width: 200, height: 50 };

/** Run the host's timers that are due, and let what each paint waits on settle. */
async function tick(): Promise<void> {
  const due = timers;
  timers = [];
  for (const run of due) run();
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

/** The band over `frame`, shown, and its picture and overlay once taken. */
async function shownBand(frame: HTMLIFrameElement) {
  const glass = new HostNode();
  const underbar = createUnderbar(glass as unknown as HTMLElement, frame);
  const band = glass.children[0] as HostNode;
  underbar.show(RECT, 1, LOOK);
  await tick();
  const image = () => band.children.find((node) => node instanceof HostNode) as HostNode | undefined;
  const cover = () => band.children.find((node) => node instanceof Canvas) as Canvas | undefined;
  return { underbar, image, cover };
}

describe("createUnderbar", () => {
  test("the overlay sits over the stretch it was drawn for, at the band's scale, and moves with the page", async () => {
    VIEW.scrollY = 1200;
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 400, true).at(0, 1850, 400, 200);
    const { frame } = frameOf([away]);
    const { underbar, image, cover } = await shownBand(frame);
    // Half the page's px: the band starts 1900 px down, and the overlay's stretch at 1200.
    expect(image()?.style.transform).toBe("translate3d(0, -950px, 0)");
    expect(image()?.style.height).toBe("2000px");
    expect(cover()?.style.transform).toBe("translate3d(0, -350px, 0)");
    expect(cover()?.style.height).toBe("750px");
    VIEW.scrollY = 1500;
    underbar.move();
    expect(cover()?.style.transform).toBe("translate3d(0, -500px, 0)");
  });

  test("the band has the page's color as a picture, which lines up with the px where a color would be smoothed into the frame's last row", () => {
    const { frame } = frameOf([new Node("p").at(0, 0, 400, 20)]);
    const glass = new HostNode();
    createUnderbar(glass as unknown as HTMLElement, frame).show(RECT, 1, LOOK);
    const band = glass.children[0] as HostNode;
    expect(band.style.background).toBe(`linear-gradient(${LOOK.background}, ${LOOK.background})`);
  });

  test("what shows over a picture drawn over the copy is drawn back over it once its drawing decodes", async () => {
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 400, true).at(0, 700, 400, 200);
    const { frame } = frameOf([new Node("div", {}, [away, new Node("h1").at(24, 750, 352, 60)]).at(0, 700, 400, 200)]);
    const { cover } = await shownBand(frame);
    // From a canvas it was drawn on once, the decoded drawing.
    const raised = cover()?.drawn.at(-1) as Canvas | undefined;
    expect(raised).toBeInstanceOf(Canvas);
    const drawing = raised?.drawn[0] as HostNode | undefined;
    expect(drawing).toBeInstanceOf(HostNode);
    expect(decodeURIComponent(drawing?.src ?? "")).toContain("visibility:hidden !important");
    // No video on it plays, so that canvas is let go of.
    expect([raised?.width, raised?.height]).toEqual([0, 0]);
  });

  test("the copy hides the controls a drawing puts on each video, as it runs no script", () => {
    const { frame } = frameOf([new Video("https://site.test/clip.mp4", 1080, 1920).unready().at(0, 900, 400, 300)]);
    pictureOf(frame, BAND);
    expect(serialized?.querySelectorAll("style").map((style) => style.text)).toContain("video::-webkit-media-controls { display: none !important; }");
  });

  test("a video that plays is drawn again at each of its frames, what shows over it back over it, till a new picture takes the cover", async () => {
    const clip = new Video("https://media.other.test/clip.mp4", 1080, 1920, true).at(0, 650, 400, 300).styled({ objectFit: "contain" });
    const sound = new Node("button").at(340, 900, 44, 44).styled({ position: "absolute" });
    const { frame } = frameOf([new Node("div", {}, [clip, sound]).at(0, 650, 400, 300)]);
    const { underbar, cover } = await shownBand(frame);
    const first = cover();
    const raised = first?.drawn.at(-1) as Canvas | undefined;
    // Kept, as the video on the cover plays.
    expect(raised).toBeInstanceOf(Canvas);
    expect(raised?.width).toBeGreaterThan(0);
    expect(clip.frames.length).toBe(1);
    const before = first?.calls.length ?? 0;
    clip.frames.shift()?.();
    const names = first?.calls.slice(before).map(([name]) => name);
    expect(names).toContain("clearRect");
    expect(first?.drawn.slice(-2)).toEqual([clip, raised]);
    // It asks for the next frame.
    expect(clip.frames.length).toBe(1);
    underbar.refresh();
    await tick();
    // The old cover was let go of.
    expect([first?.width, first?.height]).toEqual([0, 0]);
    // The old cover's video lets go: its next frame draws nothing on it and asks for no more.
    const drawnBefore = first?.calls.length;
    const asked = clip.frames.length;
    clip.frames.shift()?.();
    expect(first?.calls.length).toBe(drawnBefore);
    expect(clip.frames.length).toBe(asked - 1);
  });

  test("a scroll inside the stretch read takes no new picture, one past it takes one", async () => {
    VIEW.scrollY = 1200;
    const away = new Picture("https://cdn.other.test/x.jpg", 800, 400, true).at(0, 1850, 400, 200);
    const { frame } = frameOf([away]);
    const { underbar } = await shownBand(frame);
    const made = HostNode.made.length;
    VIEW.scrollY = 1900;
    underbar.move();
    expect(timers.length).toBe(0);
    VIEW.scrollY = 2000;
    underbar.move();
    underbar.move();
    expect(timers.length).toBe(1);
    await tick();
    expect(HostNode.made.length - made).toBe(1);
    expect(timers.length).toBe(0);
  });

  test("a picture near the band that comes in takes a new picture; one far off, or not a picture, does not", async () => {
    const near = new Picture("https://site.test/near.jpg", 800, 400).at(0, 700, 400, 200);
    const far = new Picture("https://site.test/far.jpg", 800, 400).at(0, 3600, 400, 200);
    const { frame, heard } = frameOf([near, far, new Node("div").at(0, 700, 400, 200)]);
    await shownBand(frame);
    const onLoad = heard.get("load") as (event: { target: unknown }) => void;
    onLoad({ target: far });
    onLoad({ target: new Node("div").at(0, 700, 400, 200) });
    expect(timers.length).toBe(0);
    onLoad({ target: near });
    expect(timers.length).toBe(1);
  });

  test("a new document in the frame has the listeners, the old one's are taken off, and removing the band takes off the new one's", async () => {
    const first = frameOf([new Picture("https://site.test/hero.jpg", 800, 400).at(0, 700, 400, 200)]);
    const { underbar } = await shownBand(first.frame);
    expect([...first.heard.keys()].sort()).toEqual(["load", "loadeddata", "playing", "scroll", "seeked"]);
    const next = frameOf([new Picture("https://site.test/next.jpg", 800, 400).at(0, 700, 400, 200)]);
    Reflect.set(first.frame, "contentDocument", next.doc);
    underbar.refresh();
    await tick();
    expect(first.heard.size).toBe(0);
    expect([...next.heard.keys()].sort()).toEqual(["load", "loadeddata", "playing", "scroll", "seeked"]);
    underbar.remove();
    expect(next.heard.size).toBe(0);
  });

  test("removed, it lets go of the pictures read, so a picture taken after reads them again", async () => {
    const { frame } = frameOf([new Picture("https://site.test/hero.jpg", 800, 400).at(0, 700, 400, 200)]);
    const { underbar } = await shownBand(frame);
    expect(Canvas.reads.get("https://site.test/hero.jpg")).toBe(1);
    pictureOf(frame, BAND);
    expect(Canvas.reads.get("https://site.test/hero.jpg")).toBe(1);
    underbar.remove();
    pictureOf(frame, BAND);
    expect(Canvas.reads.get("https://site.test/hero.jpg")).toBe(2);
  });
});

describe("bandSpan and inSpan", () => {
  test("the band and a viewport's height past it each way", () => {
    expect(bandSpan(1000, 700, 100)).toEqual({ top: 1000, bottom: 2500 });
    expect(bandSpan(0, 700, 100).top).toBe(0);
  });

  test("a scroll inside the reach needs no new picture, one past it does", () => {
    const span = bandSpan(1000, 700, 100);
    expect(inSpan(span, 1000, 700, 100)).toBe(true);
    expect(inSpan(span, 1700, 700, 100)).toBe(true);
    expect(inSpan(span, 1701, 700, 100)).toBe(false);
    expect(inSpan(span, 299, 700, 100)).toBe(false);
  });
});

describe("readSize", () => {
  test("no more px than the box shows at its device px, nor than the picture has", () => {
    expect(readSize({ width: 1600, height: 1200 }, 400, 300, 3)).toEqual({ width: 1200, height: 900 });
    expect(readSize({ width: 100, height: 100 }, 400, 300, 3)).toEqual({ width: 100, height: 100 });
  });

  test("a huge picture is read at 4 million px at most", () => {
    const size = readSize({ width: 8000, height: 8000 }, 4000, 4000, 3);
    expect(size.width * size.height).toBeLessThanOrEqual(4e6);
  });
});

describe("layersOf and urlOf", () => {
  test("cuts a computed background at its top commas", () => {
    expect(layersOf('linear-gradient(rgb(0, 0, 0), red), url("a,b.png"), none')).toEqual(['linear-gradient(rgb(0, 0, 0), red)', 'url("a,b.png")', "none"]);
  });

  test("the address of a url layer only", () => {
    expect(urlOf('url("https://a.test/b.png")')).toBe("https://a.test/b.png");
    expect(urlOf("url(b.png)")).toBe("b.png");
    expect(urlOf("linear-gradient(red, blue)")).toBeNull();
  });
});
