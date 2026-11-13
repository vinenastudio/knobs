import type { DevIconValue } from "../types";
import { drawDevIcon, type IconSource } from "./devicon";
import { removeMark, setMark } from "../mark";

/**
 * The dev ribbon on the page's own icons, so a dev tab tells itself apart
 * from production at a glance. Every icon link of the top document, the
 * apple touch icon too, gets its picture drawn again with the ribbon and
 * put back as a png data url. Its own address is kept on the link, and goes
 * back as it was when the ribbon goes. A framework that swaps the head's
 * links on a navigation gets its new ones drawn too.
 */

/** Where a link keeps the address it had before the ribbon. */
export const ORIGINAL_HREF = "data-devknobs-href";

/** Marks the icon link devknobs added, on a page with none, for its `/favicon.ico`. */
export const ADDED_ICON = "data-devknobs-icon";

/** The icon a page with no icon link has, where the browser looks for one. */
const FALLBACK = "/favicon.ico";

const TOUCH_RELS = ["apple-touch-icon", "apple-touch-icon-precomposed"];

/** Whether a host is this machine or the local network, where a page is a dev one. */
export function localHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "[::1]" || host === "::1" || host === "0.0.0.0") return true;
  // IPv6 unique local (fc00::/7) and link-local (fe80::/10) addresses.
  if (/^\[?(f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/.test(host)) return true;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ip) return false;
  const [a = 0, b = 0, ...rest] = ip.slice(1).map(Number);
  if ([a, b, ...rest].some((part) => part > 255)) return false;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Whether the ribbon shows on a host: `auto` on a local one only. */
export function devIconShown(value: DevIconValue, hostname: string): boolean {
  return value === "on" || (value === "auto" && localHost(hostname));
}

/** The value that shows the ribbon or not on a host: `auto` where that is what a local host or another does anyway. */
export function devIconFor(on: boolean, hostname: string): DevIconValue {
  if (on === localHost(hostname)) return "auto";
  return on ? "on" : "off";
}

/** Whether the ribbon shows on this page: the top document's alone, as the tab's icon is its. */
export function shownHere(value: DevIconValue): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  return window.top === window && devIconShown(value, window.location.hostname);
}

function relTokens(link: Element): string[] {
  return (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

/** A link the browser takes for the tab's icon or the home screen's. */
export function isIconLink(node: unknown): node is Element {
  if (typeof node !== "object" || node === null) return false;
  const link = node as Element;
  if (link.nodeType !== 1 || link.localName !== "link") return false;
  return relTokens(link).some((rel) => rel === "icon" || TOUCH_RELS.includes(rel));
}

/** The smallest and biggest size an icon is drawn at, in px: 512 is the biggest real favicon. */
const SIZE_MIN = 16;
const SIZE_MAX = 512;

/** The size a link's icon is drawn at: its first declared size in 16 to 512, else 32, or 180 for a touch icon. */
export function iconSize(link: Element): number {
  const declared = /^(\d+)x(\d+)$/i.exec((link.getAttribute("sizes") ?? "").trim().split(/\s+/)[0] ?? "");
  const width = declared ? Number(declared[1]) : 0;
  if (width > 0) return Math.min(SIZE_MAX, Math.max(SIZE_MIN, width));
  return relTokens(link).some((rel) => TOUCH_RELS.includes(rel)) ? 180 : 32;
}

/** What the ribbon needs from the page, so tests can hand in their own. */
export interface TabIconEnv {
  document: Document;
  /** An address as a decoded image, null where it does not load. */
  load(href: string): Promise<IconSource | null>;
  /** The icon with the ribbon at `size` px as a png data url, null where it cannot be read back. */
  render(source: IconSource, size: number): string | null;
  Observer: typeof MutationObserver | undefined;
}

export interface TabIcon {
  start(): void;
  /** Give every link its own address back, and stop watching the head. */
  stop(): void;
}

export function createTabIcon(env: TabIconEnv): TabIcon {
  const doc = env.document;
  let on = false;
  let observer: MutationObserver | null = null;
  /** Each link drawn, by the data url devknobs gave it and the address it had. */
  const drawn = new Map<Element, { url: string; original: string }>();
  /** The address each link's picture is loading from. */
  const loading = new Map<Element, string>();
  let added: Element | null = null;
  let told = false;

  function iconLinks(): Element[] {
    return Array.from(doc.querySelectorAll("link")).filter(isIconLink);
  }

  /** Draw a link's icon again with the ribbon, from its own address. */
  function swap(link: Element): void {
    if (!on || !isIconLink(link)) return;
    const current = link.getAttribute("href");
    if (!current) return;
    const mine = drawn.get(link);
    // The ribbon's own picture is drawn again from the address under it, as for a new size.
    const href = mine?.url === current ? mine.original : current;
    if (loading.get(link) === href) return;
    loading.set(link, href);
    void env.load(href).then((source) => {
      if (loading.get(link) !== href) return;
      loading.delete(link);
      if (!on || link.getAttribute("href") !== current) return;
      const url = source ? env.render(source, iconSize(link)) : null;
      if (!url) {
        if (!told) console.debug(`knobs: the tab icon ${href} could not be read, so it shows no dev ribbon`);
        told = true;
        return;
      }
      drawn.set(link, { url, original: href });
      setMark(link, ORIGINAL_HREF, href);
      link.setAttribute("href", url);
    });
  }

  /** Give a link its own address back and drop what devknobs keeps for it. */
  function forget(link: Element): void {
    loading.delete(link);
    const mine = drawn.get(link);
    if (!mine) return;
    drawn.delete(link);
    if (link.getAttribute("href") === mine.url) link.setAttribute("href", mine.original);
    removeMark(link, ORIGINAL_HREF);
  }

  function linksIn(node: Node): Element[] {
    if (isIconLink(node)) return [node];
    if (node.nodeType !== 1) return [];
    return Array.from((node as Element).querySelectorAll("link")).filter(isIconLink);
  }

  /** A page with no icon link gets its `/favicon.ico` as one, where it has that file. */
  function fallback(): void {
    void env.load(FALLBACK).then((source) => {
      if (!on || !source || added || iconLinks().length > 0) return;
      const link = doc.createElement("link");
      link.setAttribute("rel", "icon");
      link.setAttribute("href", FALLBACK);
      setMark(link, ADDED_ICON);
      added = link;
      (doc.head ?? doc.documentElement).append(link);
      swap(link);
    });
  }

  function watch(records: MutationRecord[]): void {
    for (const record of records) {
      if (record.type === "attributes") {
        const link = record.target as Element;
        // A link that is no icon any more has its own address back.
        if (!isIconLink(link)) {
          forget(link);
          continue;
        }
        // Its own write of the ribbon is no change.
        if (record.attributeName === "href" && drawn.get(link)?.url === link.getAttribute("href")) continue;
        swap(link);
        continue;
      }
      // A link taken out of the page is dropped, so its picture is not held on to.
      for (const node of Array.from(record.removedNodes)) {
        for (const link of linksIn(node)) if (link !== added) forget(link);
      }
      for (const node of Array.from(record.addedNodes)) {
        for (const link of linksIn(node)) {
          // The page has an icon of its own again: the one devknobs added goes.
          if (link !== added && added) {
            added.remove();
            added = null;
          }
          swap(link);
        }
      }
    }
  }

  return {
    start(): void {
      if (on) return;
      on = true;
      const links = iconLinks();
      for (const link of links) swap(link);
      if (links.length === 0) fallback();
      if (!env.Observer) return;
      observer = new env.Observer(watch);
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "rel", "sizes"],
      });
    },
    stop(): void {
      if (!on) return;
      on = false;
      observer?.disconnect();
      observer = null;
      loading.clear();
      for (const [link, { url, original }] of drawn) {
        // A link the page has pointed elsewhere since keeps the page's address.
        if (link.getAttribute("href") === url) link.setAttribute("href", original);
        removeMark(link, ORIGINAL_HREF);
      }
      drawn.clear();
      added?.remove();
      added = null;
    },
  };
}

function loadImage(href: string): Promise<IconSource | null> {
  return new Promise((resolve) => {
    const image = new Image();
    // A cross-origin icon that allows it can be read back; one that does not keeps its own picture.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = href;
  });
}

function renderPng(source: IconSource, size: number): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;
    drawDevIcon(context, size, source);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

let live: TabIcon | null = null;

export function apply(on: boolean): void {
  if (!on) {
    reset();
    return;
  }
  if (live || typeof document === "undefined") return;
  live = createTabIcon({
    document,
    load: loadImage,
    render: renderPng,
    Observer: typeof MutationObserver === "undefined" ? undefined : MutationObserver,
  });
  live.start();
}

export function reset(): void {
  live?.stop();
  live = null;
}
