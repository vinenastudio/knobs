import { ensureStyle, removeStyle } from "../engine/style";
import { pause } from "../engine/touchpointer";
import { copyGrab } from "./clipboard";
import { componentOf, grabEntry, quickEntry } from "./context";
import { DWELL, settles, speedOf } from "./dwell";
import { grabTargetAt, isDevknobs } from "./hit";
import { isCLike } from "./keys";
import { createNavigator, stepOf } from "./navigate";
import { createOverlay, HIDE_WAIT, type Overlay } from "./overlay";
import { copiedText, flushPicks, picksPayload } from "./picks";
import { elementsInRect, isDrag, type Point, rectFrom } from "./rect";
import { createTray, isTrayEvent, type Tray, TRAY_CSS } from "./tray";
import type { GrabEntry } from "./types";
import { ownSelector } from "../mark";
import { letterMatches } from "../ui/keys";

/** How long the pointer rests on an element before its context is worked out, in ms. */
const PREPARE = 80;

// adapted from react-grab (MIT, Copyright (c) 2025 Aiden Bai)
/** The least time between two hit tests as the pointer moves, in ms. */
const HIT_EVERY = 32;

/** The least time between two looks at what a drag would gather, in ms. */
const PREVIEW_EVERY = 100;

/** Pointer and mouse events that would reach the page's own handlers. */
const BLOCKED = [
  "pointerdown",
  "mousedown",
  "pointerup",
  "mouseup",
  "click",
  "dblclick",
  "auxclick",
  "pointerover",
  "pointerout",
  "mouseover",
  "mouseout",
] as const;

/** What a pick does where it is not grab's copy. */
export interface Purpose {
  /** What the label says of an element, in place of its tag and its component. */
  label(element: Element): { tag: string; name: string | null };
  /** An element was picked. Nothing is copied, and the mode ends with the pick. */
  pick(element: Element): void;
}

export interface ModeOptions {
  /** Where the pointer was last, so the element under it shows straight away. */
  pointer?: { x: number; y: number } | null;
  /** The scheme the layer takes, where the page's own cannot be trusted. */
  scheme?: "light" | "dark";
  /** The grab key's own key, whatever modifiers are down. */
  heldKey: (event: KeyboardEvent) => boolean;
  /** Another use of the picking than grab's copy, as inspect is. */
  purpose?: Purpose;
  /** Grab ended from inside: a copy, a pick handed to a purpose, or escape. */
  onExit(): void;
}

export interface Mode {
  /** Keys come through the control, ahead of the panel's, so escape stops here. */
  keydown(event: KeyboardEvent): void;
  /** End grab without a word to anyone. */
  stop(): void;
}

/** What the mode reads of the page and writes to it, so a test can stand in for each. */
export interface ModePage {
  componentOf: typeof componentOf;
  copyGrab: typeof copyGrab;
  createOverlay: (quiet?: boolean, model?: boolean) => Overlay;
  createTray: typeof createTray;
  elementsInRect: typeof elementsInRect;
  grabEntry: typeof grabEntry;
  grabTargetAt: typeof grabTargetAt;
  quickEntry: typeof quickEntry;
}

const PAGE: ModePage = {
  componentOf,
  copyGrab,
  createOverlay,
  createTray,
  elementsInRect,
  grabEntry,
  grabTargetAt,
  quickEntry,
};

function fromDevknobs(event: Event): boolean {
  const target = event.composedPath()[0];
  return target instanceof Element && isDevknobs(target);
}

function isTyping(event: Event): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/** The key is a control's own: a button it presses or moves from, or a field it is typed in. */
function onControl(event: Event): boolean {
  const target = event.composedPath()[0];
  return isTyping(event) || (target instanceof HTMLElement && target.tagName === "BUTTON");
}

/**
 * Grab, on: the element under the pointer gets a box and a label, a click
 * copies it, shift and a click or a drag gather more, and the arrows walk the
 * tree. What is gathered is listed in a tray, with a note for each and one for all.
 * The context of the element under the pointer is worked out while it rests
 * there, so a click can copy it whole in the click itself, as Safari wants.
 * The box goes to an element once the pointer settles on it, and not to those
 * it only passes over. With a `purpose` the picking is the same and what a pick
 * does is not: nothing is gathered or copied, the pick is handed over and ends
 * the mode, and until then the box shows the element's margin, border, padding
 * and content, with a card of what its text is set in by it.
 */
export function startMode(options: ModeOptions, page: ModePage = PAGE): Mode {
  const { purpose } = options;
  // Inspect draws the box of what it is on, and says more of it than grab does.
  const overlay = page.createOverlay(false, purpose !== undefined);
  const navigator = createNavigator();
  const ready = new WeakMap<Element, GrabEntry>();
  const warming = new WeakSet<Element>();
  const labels = new WeakMap<Element, string | null>();
  let current: Element | null = null;
  /** What the last hit test found, the box on it or not yet, and since when. */
  let candidate: Element | null = null;
  let since = 0;
  /** When the box last lost its element. It stays up a moment after. */
  let leftAt = Number.NEGATIVE_INFINITY;
  let picked: Element[] = [];
  let prepareTimer = 0;
  let point: { x: number; y: number } | null = null;
  /** Where the pointer was at the last hit test. */
  let hitPoint: { x: number; y: number } | null = null;
  let hitAt = 0;
  let hitTimer = 0;
  let settleTimer = 0;
  let stopped = false;
  /** The gathered elements, with their notes, while there is one. */
  let tray: Tray | null = null;
  /** Where the primary button went down on the page, while it is down. */
  let down: Point | null = null;
  /** Where a drag is now, once the press went far enough to be one. */
  let dragTo: Point | null = null;
  let preview: Element[] = [];
  let previewAt = Number.NEGATIVE_INFINITY;
  let previewTimer = 0;
  /** The click after a drag is the drag's own, and copies nothing. */
  let swallowClick = false;

  ensureStyle("grab-cursor").textContent = `*:not(${ownSelector()}){cursor:crosshair!important}`;
  // The touch pointer gives the mouse back while grab picks.
  pause(true);

  function warm(element: Element): void {
    if (purpose || ready.has(element) || warming.has(element)) return;
    warming.add(element);
    void page.grabEntry(element)
      .then((entry) => ready.set(element, entry))
      .catch(() => undefined)
      .finally(() => warming.delete(element));
  }

  function labelOf(element: Element): { tag: string; name: string | null } {
    if (purpose) return purpose.label(element);
    let name = labels.get(element);
    if (name === undefined) {
      name = page.componentOf(element);
      labels.set(element, name);
    }
    return { tag: element.tagName.toLowerCase(), name };
  }

  /** Hand the overlay what to box. It reads the bounds and draws on its own frames. */
  function draw(): void {
    if (stopped) return;
    if (current && !current.isConnected) current = null;
    const kept = picked.filter((element) => element.isConnected);
    if (kept.length !== picked.length) {
      if (tray) {
        // The tray drops the row's note too; its onRemove draws again, which takes the next one.
        tray.remove(picked.findLastIndex((element) => !element.isConnected));
        return;
      }
      picked = kept;
      syncTray();
    }
    overlay.draw(current, current ? labelOf(current) : { tag: "", name: null }, picked);
  }

  /** The tray comes with the first pick, lists them all, and goes with the last. */
  function syncTray(): void {
    if (purpose || stopped) return;
    if (picked.length === 0) {
      tray?.destroy();
      tray = null;
      return;
    }
    if (!tray) {
      tray = page.createTray({
        onRemove: (index) => setPicks(picked.filter((_, at) => at !== index)),
        onCopy: () => copy(picked),
        onEscape: () => undefined,
      });
      overlay.mount(tray.node, TRAY_CSS);
    }
    tray.update(picked.map((element) => ({ label: labelOf(element) })));
  }

  function setPicks(next: Element[]): void {
    picked = next;
    syncTray();
    draw();
  }

  /** Take one out, its note with it where the tray has one. */
  function unpick(element: Element): void {
    const index = picked.indexOf(element);
    if (index < 0) return;
    if (tray) tray.remove(index);
    else setPicks(picked.filter((_, at) => at !== index));
  }

  /** Gather an element, or take it back out where it was gathered. */
  function toggle(element: Element): void {
    if (picked.includes(element)) {
      unpick(element);
      return;
    }
    warm(element);
    setPicks([...picked, element]);
  }

  function select(element: Element | null): void {
    if (element === current) return;
    current = element;
    if (!element) leftAt = performance.now();
    clearTimeout(prepareTimer);
    if (element) prepareTimer = window.setTimeout(() => warm(element), PREPARE);
    draw();
  }

  /**
   * Copy now, in the event that asked. What is not worked out yet goes as
   * the quick entry, and is worked out after for the next copy. The
   * clipboard is never written again outside a gesture.
   */
  function copy(elements: Element[]): void {
    if (elements.length === 0) return;
    const entries = elements.map((element) => ready.get(element) ?? page.quickEntry(element));
    const anchor = elements[elements.length - 1] ?? null;
    overlay.toast(copiedText(elements.length), anchor, true);
    const notes = tray?.notes();
    void page.copyGrab(picksPayload(entries, notes?.each, notes?.all)).then((copied) => {
      if (!copied) overlay.toast("Copy failed", anchor, false);
    });
    for (const element of elements) warm(element);
    exit();
  }

  /** No hit test is to come: the keys moved the box, or grab is over. */
  function drop(): void {
    clearTimeout(hitTimer);
    clearTimeout(settleTimer);
    hitTimer = 0;
    settleTimer = 0;
  }

  /**
   * Test what is under the pointer, and box it once the pointer has settled
   * on it. Until then the test runs again by itself, as a pointer that came
   * to rest sends no more moves. With nothing under the pointer the box is let
   * go at once, and stays up a moment on its own. `now` is for a click or a
   * key, which take what is under the pointer and not what the box was on.
   */
  function hit(now = false): void {
    drop();
    if (!point) return;
    const at = performance.now();
    const target = page.grabTargetAt(document, point.x, point.y);
    const speed = speedOf(hitPoint ?? point, point, at - hitAt);
    hitAt = at;
    hitPoint = point;
    if (target !== candidate) {
      candidate = target;
      since = at;
    }
    if (target === current) return;
    const held = at - since;
    const boxed = current !== null || at - leftAt < HIDE_WAIT;
    if (now || !target || settles({ boxed, held, speed })) {
      navigator.clear();
      select(target);
      return;
    }
    settleTimer = window.setTimeout(() => hit(), Math.min(HIT_EVERY, DWELL - held));
  }

  /** A hit test still to come is run now, so a click or a key acts on its element. */
  function resolve(at = point): void {
    if (!hitTimer && !settleTimer) return;
    point = at;
    hit(true);
  }

  /** Draw the drag's rectangle, and look again at what it would gather once in a while. */
  function drawDrag(): void {
    if (!down || !dragTo) return;
    const rect = rectFrom(down, dragTo);
    const now = performance.now();
    const wait = PREVIEW_EVERY - (now - previewAt);
    if (wait <= 0) {
      clearTimeout(previewTimer);
      previewTimer = 0;
      previewAt = now;
      preview = page.elementsInRect(document, rect);
    } else if (!previewTimer) {
      previewTimer = window.setTimeout(() => {
        previewTimer = 0;
        drawDrag();
      }, wait);
    }
    overlay.marquee(rect, preview);
  }

  function endDrag(): void {
    clearTimeout(previewTimer);
    previewTimer = 0;
    down = null;
    dragTo = null;
    preview = [];
    previewAt = Number.NEGATIVE_INFINITY;
  }

  /** A drag let go: what it went around is gathered, after what was before. It copies nothing. */
  function finishDrag(at: Point): void {
    const from = down;
    const dragged = dragTo !== null;
    endDrag();
    if (!from || !dragged) return;
    overlay.marquee(null, []);
    swallowClick = true;
    const added = page.elementsInRect(document, rectFrom(from, at)).filter((element) => !picked.includes(element));
    for (const element of added) warm(element);
    if (added.length > 0) setPicks([...picked, ...added]);
  }

  function onPointerCancel(): void {
    if (dragTo) overlay.marquee(null, []);
    endDrag();
  }

  /** The hit test runs at most once in a while, and once more where the pointer came to rest. */
  function onPointerMove(event: PointerEvent): void {
    if (!event.isPrimary) return;
    point = { x: event.clientX, y: event.clientY };
    if (down && (dragTo || isDrag(down, point))) {
      if (!dragTo) {
        // The box is not shown while a drag is drawn.
        drop();
        navigator.clear();
        select(null);
      }
      dragTo = point;
      drawDrag();
      return;
    }
    overlay.point(point.x);
    const wait = HIT_EVERY - (performance.now() - hitAt);
    if (wait <= 0) {
      hit();
    } else if (!hitTimer) {
      hitTimer = window.setTimeout(() => hit(), wait);
    }
  }

  function onBlocked(event: Event): void {
    // A drag let go over knobs' own UI, the tray too, still ends.
    if (event.type === "pointerup" && down) {
      const up = event as PointerEvent;
      if (up.isPrimary) finishDrag({ x: up.clientX, y: up.clientY });
    }
    if (fromDevknobs(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "pointerdown" && !purpose) {
      const press = event as PointerEvent;
      swallowClick = false;
      if (press.isPrimary && press.button === 0) down = { x: press.clientX, y: press.clientY };
      return;
    }
    if (event.type !== "click" || !(event instanceof MouseEvent)) return;
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    resolve({ x: event.clientX, y: event.clientY });
    const target =
      page.grabTargetAt(document, event.clientX, event.clientY) ??
      (current?.isConnected ? current : null);
    if (!target) return;
    if (purpose) {
      purpose.pick(target);
      exit();
      return;
    }
    if (event.shiftKey) {
      toggle(target);
      return;
    }
    copy(flushPicks(picked, target));
  }

  function keydown(event: KeyboardEvent): void {
    // What is typed in the tray is the tray's, its escape too.
    if (isTrayEvent(event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      exit();
      return;
    }
    const step = stepOf(event);
    if (step) {
      if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return;
      // Its pane has controls: tab still goes from one to the next, and they keep their arrows.
      if (purpose && (event.key === "Tab" || onControl(event))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const next = current?.isConnected ? navigator.next(step, current) : null;
      if (next) {
        drop();
        overlay.point(null);
        select(next);
      }
      return;
    }
    if (event.repeat) {
      // The grab key, still held from turning grab on, its modifiers let go or not.
      if (options.heldKey(event)) event.preventDefault();
      return;
    }
    if (purpose) {
      if (event.key !== "Enter" || onControl(event)) return;
      resolve();
      if (!current?.isConnected) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      purpose.pick(current);
      exit();
      return;
    }
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    if (event.key === "Enter" && event.shiftKey && plain) {
      resolve();
      if (!current?.isConnected) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle(current);
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && plain && !isTyping(event)) {
      resolve();
      if (!current || !picked.includes(current)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      unpick(current);
      return;
    }
    if (tray && plain && !event.shiftKey && !isTyping(event) && letterMatches(event, "n")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      resolve();
      const index = current ? picked.indexOf(current) : -1;
      tray.focusNote(index >= 0 ? index : null);
      return;
    }
    if (event.key !== "Enter" && !isCLike(event.key, event.code)) return;
    resolve();
    const elements = flushPicks(picked, current);
    if (elements.length === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    copy(elements);
  }

  for (const type of BLOCKED) window.addEventListener(type, onBlocked, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointercancel", onPointerCancel, true);

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearTimeout(prepareTimer);
    drop();
    endDrag();
    for (const type of BLOCKED) window.removeEventListener(type, onBlocked, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointercancel", onPointerCancel, true);
    removeStyle("grab-cursor");
    pause(false);
    tray?.destroy();
    tray = null;
    overlay.destroy();
  }

  function exit(): void {
    stop();
    options.onExit();
  }

  if (options.pointer) {
    point = options.pointer;
    overlay.point(point.x);
    hit();
  }

  return { keydown, stop };
}
