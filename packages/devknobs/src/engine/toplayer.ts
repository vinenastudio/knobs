import { ensureStyle, removeStyle } from "./style";
import { either, OLD_MARK } from "../mark";

/**
 * Devknobs' own layers in the top layer, over the page's modal dialogs,
 * popovers and fullscreen element, where the browser has popovers. Each host
 * is a manual popover, which closes no other popover and no light dismiss
 * closes. The top layer keeps the order things came in and paints the last
 * over the rest, so a host goes out and in again to go on top, and the hosts
 * go in again in their order whenever the page puts something new there.
 * Without popovers each host stays a plain layer, its z-index its order.
 */

/**
 * Where each host goes, the lowest first: grab's boxes, then the panel, then
 * a guide that points at the panel, such as a tour of it, then the touch cursor.
 */
export const LAYER = { overlay: 0, panel: 1, guide: 2, touch: 3 } as const;

/**
 * What a host's shadow root holds, so that none of the look a popover comes
 * with, from the browser or from the page's own popover rules, reaches it.
 * Where the host sits and how big it is stay its own.
 */
export const HOST_RESET = `
:host([popover]) {
  display: block !important;
  position: fixed !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
  color: inherit !important;
  overflow: visible !important;
  max-width: none !important;
  max-height: none !important;
  box-shadow: none !important;
  outline: none !important;
  opacity: 1 !important;
  transform: none !important;
  translate: none !important;
  scale: none !important;
  rotate: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  clip-path: none !important;
  mask: none !important;
  contain: none !important;
  container-type: normal !important;
  content-visibility: visible !important;
  visibility: visible !important;
  perspective: none !important;
  will-change: auto !important;
  zoom: 1 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  position-anchor: auto !important;
  position-area: none !important;
  transition: none !important;
  animation: none !important;
}`;

/** A host's backdrop stays out, whatever the page gives every backdrop. */
const BACKDROP_CSS = `${either(OLD_MARK, "][popover]::backdrop")}{display:none!important}`;

/** How an element tells it is in the top layer: an open popover, a modal dialog, the fullscreen element. */
const TOP_LAYER = [":popover-open", ":modal", ":fullscreen"];

/** The pointer events whose path is read for a dialog or a popover in a shadow root. */
const POINTER = ["pointerover", "pointermove", "pointerdown"] as const;

/** A host in the top layer, to put on top again after it went back in the page, and to let go of. */
export interface TopLayerHold {
  raise(): void;
  release(): void;
}

interface Held {
  host: HTMLElement;
  rank: number;
}

/** The hosts held, the lowest first. */
let held: Held[] = [];
/** Sees a dialog open where the browser sends no `toggle` for it. */
let dialogs: MutationObserver | null = null;
/** What the pointer is over in the top layer, as of its last way in, move or press. */
let over: Element | null = null;

/**
 * Does a `toggle` or `beforetoggle` event tell of something that joins the
 * top layer, where the last to come in paints over the rest? A popover or a
 * dialog that opens does. Devknobs' own hosts and a `details` do not.
 */
export function raises(change: { newState: unknown; tag: string; own: boolean }): boolean {
  return !change.own && change.newState === "open" && change.tag.toLowerCase() !== "details";
}

/** Did a change of an `open` attribute open a dialog? For browsers whose dialogs send no `toggle`. */
export function dialogOpened(change: {
  tag: string;
  was: string | null;
  open: boolean;
}): boolean {
  return change.tag.toLowerCase() === "dialog" && change.was === null && change.open;
}

/**
 * The first thing on an event's path, from the target out, that is in the top
 * layer. The path goes through shadow roots, where no `toggle` comes out of.
 */
export function topLayerOf<T>(
  path: readonly unknown[],
  inTopLayer: (node: unknown) => node is T,
): T | null {
  return path.find(inTopLayer) ?? null;
}

/** Where a host of `rank` goes among those held, after any of the same rank. */
export function placeOf(ranks: readonly number[], rank: number): number {
  const index = ranks.findIndex((other) => other > rank);
  return index === -1 ? ranks.length : index;
}

/** Can a host go in the top layer? Without popovers it stays a plain layer. */
export function layered(): boolean {
  return typeof HTMLElement === "function" && typeof HTMLElement.prototype.showPopover === "function";
}

function isOwn(node: unknown): boolean {
  return held.some((entry) => entry.host === node);
}

function inTopLayer(node: unknown): node is Element {
  if (!(node instanceof Element) || isOwn(node)) return false;
  for (let index = 0; index < TOP_LAYER.length; index++) {
    try {
      if (node.matches(TOP_LAYER[index] ?? "")) return true;
    } catch {
      // A browser from before this selector has nothing of its kind in the top layer.
    }
  }
  return false;
}

/**
 * Put a host last in the top layer. Its shadow root's reset keeps it shown
 * while it is out, for the moment it is, so it keeps its layout and focus.
 */
function show(host: HTMLElement): void {
  try {
    if (host.matches(":popover-open")) host.hidePopover();
    host.showPopover();
  } catch {
    // Not in the page, or the browser would not show it: the host stays a plain layer.
  }
}

/** Put the hosts from `rank` up last in the top layer, in their order. */
function raiseFrom(rank: number): void {
  for (const entry of held) if (entry.rank >= rank) show(entry.host);
}

function raiseAll(): void {
  raiseFrom(Number.NEGATIVE_INFINITY);
}

/**
 * Go over what the pointer is on in the top layer, where it is not what it
 * was on before. This sees a dialog or a popover in a shadow root, whose
 * `toggle` and `open` attribute the watch on the page does not. It runs on
 * each way in, move and press, so the first move after such an opening puts
 * the hosts back on top.
 */
function onPointer(event: Event): void {
  const found = topLayerOf(event.composedPath(), inTopLayer);
  if (found === over) return;
  over = found;
  if (found) raiseAll();
}

function onToggle(event: Event): void {
  const target = event.composedPath()[0];
  const own = isOwn(target);
  // The page hears nothing of a host's own way in and out.
  if (own) event.stopImmediatePropagation();
  if (!(target instanceof Element)) return;
  const newState = "newState" in event ? event.newState : undefined;
  if (!raises({ newState, tag: target.tagName, own })) return;
  // `beforetoggle` comes before the top layer has the newcomer, `toggle` a task after.
  if (event.type === "beforetoggle") queueMicrotask(raiseAll);
  else raiseAll();
}

function onFullscreen(): void {
  if (document.fullscreenElement) raiseAll();
}

function onDialogs(records: MutationRecord[]): void {
  const opened = records.some(
    (record) =>
      record.target instanceof Element &&
      dialogOpened({
        tag: record.target.tagName,
        was: record.oldValue,
        open: record.target.hasAttribute("open"),
      }),
  );
  if (opened) raiseAll();
}

/** Keep the hosts over whatever joins the top layer after them. */
function watch(): void {
  ensureStyle("top-layer").textContent = BACKDROP_CSS;
  window.addEventListener("beforetoggle", onToggle, true);
  window.addEventListener("toggle", onToggle, true);
  window.addEventListener("fullscreenchange", onFullscreen, true);
  for (const type of POINTER) window.addEventListener(type, onPointer, true);
  if (typeof MutationObserver !== "function") return;
  dialogs = new MutationObserver(onDialogs);
  dialogs.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
    attributeOldValue: true,
  });
}

function unwatch(): void {
  removeStyle("top-layer");
  window.removeEventListener("beforetoggle", onToggle, true);
  window.removeEventListener("toggle", onToggle, true);
  window.removeEventListener("fullscreenchange", onFullscreen, true);
  for (const type of POINTER) window.removeEventListener(type, onPointer, true);
  dialogs?.disconnect();
  dialogs = null;
  over = null;
}

/**
 * Put `host`, already in the page, in the top layer at its `rank`, and the
 * hosts above it in again over it. Where the browser has no popovers, or
 * will not show this one, it stays where it is, no popover, and nothing is
 * watched for it.
 */
export function holdInTopLayer(host: HTMLElement, rank: number): TopLayerHold {
  if (!layered()) return { raise() {}, release() {} };
  const entry: Held = { host, rank };
  const first = held.length === 0;
  held.splice(
    placeOf(
      held.map((other) => other.rank),
      rank,
    ),
    0,
    entry,
  );
  host.setAttribute("popover", "manual");
  if (first) watch();
  raiseFrom(rank);
  if (!host.matches(":popover-open")) {
    // A popover that is not open is not drawn at all.
    host.removeAttribute("popover");
    held = held.filter((other) => other !== entry);
    if (held.length === 0) unwatch();
    return { raise() {}, release() {} };
  }
  return {
    raise(): void {
      if (held.includes(entry)) raiseFrom(rank);
    },
    release(): void {
      if (!held.includes(entry)) return;
      held = held.filter((other) => other !== entry);
      if (held.length === 0) unwatch();
    },
  };
}
