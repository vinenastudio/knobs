import { baseMatchMedia } from "../engine/matchmedia";
import { markOwn } from "../mark";

/** How long the tray takes to come in, in ms. */
const SHOW = 150;

/**
 * The tray of gathered elements, at the bottom of the window inside grab's
 * layer. It goes by the page as the label does: dark by default, light where
 * the overlay sets `data-bar="light"` on it.
 */
export const TRAY_CSS = `
.tray {
  --bar: #161616;
  --quiet: #a7a7a7;
  --rim: rgb(255 255 255 / 12%);
  --field: rgb(255 255 255 / 6%);
  --hover: rgb(255 255 255 / 10%);
  position: fixed;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
  width: min(380px, calc(100vw - 32px));
  max-height: 40vh;
  padding: 6px;
  transform: translateX(-50%);
  pointer-events: auto;
  color: #ffffff;
  background: var(--bar);
  border-radius: 13px;
  box-shadow: 0 0 0 1px var(--rim), 0 2px 8px rgb(0 0 0 / 24%);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 16px;
}
.tray[data-bar="light"] {
  --bar: #ffffff;
  --quiet: #737373;
  --rim: rgb(0 0 0 / 10%);
  --field: rgb(0 0 0 / 4%);
  --hover: rgb(0 0 0 / 8%);
  color: #171717;
  box-shadow: 0 0 0 1px var(--rim), 0 2px 8px rgb(0 0 0 / 32%);
}
.tray.in { animation: tray-in ${SHOW}ms ease-out; }
@keyframes tray-in {
  from { opacity: 0; transform: translate(-50%, 6px); }
}
@media (prefers-reduced-motion: reduce) {
  .tray.in { animation: none; }
}
.layer[data-still] .tray { animation: none; }
.tray .list {
  display: grid;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.tray .item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 2px 2px 6px;
  border-radius: 8px;
}
.tray .num {
  flex: none;
  display: grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 8px;
  color: #ffffff;
  background: var(--grab, #0a84ff);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.tray .name {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tray .name .tag { color: var(--quiet); }
.tray input, .tray textarea {
  all: unset;
  box-sizing: border-box;
  min-width: 0;
  padding: 4px 6px;
  color: inherit;
  background: var(--field);
  border-radius: 4px;
  font: inherit;
}
.tray input { flex: 1 1 auto; height: 24px; }
.tray textarea {
  display: block;
  width: 100%;
  border-radius: 8px;
  white-space: pre-wrap;
  resize: none;
}
.tray input::placeholder, .tray textarea::placeholder { color: var(--quiet); }
.tray input:focus-visible, .tray textarea:focus-visible, .tray button:focus-visible {
  outline: 1px solid var(--quiet, #a7a7a7);
  outline-offset: -1px;
}
.tray button {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  border-radius: 4px;
  font: inherit;
}
.tray .remove {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--quiet);
  font-size: 16px;
}
.tray .remove:hover { color: inherit; background: var(--hover); }
.tray .foot { display: flex; align-items: center; gap: 8px; }
.tray .hint {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--quiet);
  font-size: 11px;
}
.tray .copy {
  flex: none;
  height: 24px;
  padding: 0 10px;
  color: #ffffff;
  background: var(--grab, #0a84ff);
  font-weight: 500;
}
.tray .copy:hover { filter: brightness(1.08); }
`;

export interface TrayItem {
  label: { tag: string; name: string | null };
}

export interface TrayOptions {
  /** A row's remove button was pressed. The tray has dropped its note already. */
  onRemove(index: number): void;
  onCopy(): void;
}

export interface Tray {
  node: HTMLElement;
  update(items: TrayItem[]): void;
  /** Take a row out as its remove button does: its note goes, and `onRemove` is told. */
  remove(index: number): void;
  /** Each row's note and the overall one, as typed. */
  notes(): { each: string[]; all: string };
  /** Focus a row's note, or with null the overall note. */
  focusNote(index: number | null): void;
  contains(target: EventTarget | null): boolean;
  destroy(): void;
}

/**
 * The notes kept when the list changes: the one at `removed` dropped, then
 * cut or filled with empty ones to `length`.
 */
export function alignNotes(notes: readonly string[], removed: number | null, length: number): string[] {
  const kept = removed === null ? [...notes] : notes.filter((_, index) => index !== removed);
  return Array.from({ length }, (_, index) => kept[index] ?? "");
}

interface Row {
  node: HTMLElement;
  num: HTMLElement;
  tag: HTMLElement;
  name: HTMLElement;
  input: HTMLInputElement;
  remove: HTMLButtonElement;
  key: string;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function isField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function createTray(options: TrayOptions): Tray {
  const node = element("div", "tray");
  markOwn(node, "grab-tray");
  node.setAttribute("role", "region");
  node.setAttribute("aria-label", "Picked elements");
  const list = element("div", "list");
  const all = element("textarea");
  all.rows = 2;
  all.placeholder = "Note for all";
  all.setAttribute("aria-label", "Note for all");
  const foot = element("div", "foot");
  const hint = element("div", "hint");
  hint.textContent = "⇧ click or drag to add · n note · ↩ copy · esc";
  const copy = element("button", "copy");
  copy.type = "button";
  foot.append(hint, copy);
  node.append(list, all, foot);

  const rows: Row[] = [];
  let shown = false;

  function makeRow(): Row {
    const row: Row = {
      node: element("div", "item"),
      num: element("span", "num"),
      tag: element("span", "tag"),
      name: element("span", "name"),
      input: element("input"),
      remove: element("button", "remove"),
      key: "",
    };
    row.input.type = "text";
    row.input.placeholder = "Note";
    row.input.spellcheck = false;
    row.remove.type = "button";
    row.remove.textContent = "×";
    row.remove.addEventListener("click", () => removeAt(rows.indexOf(row)));
    row.node.append(row.num, row.name, row.input, row.remove);
    return row;
  }

  function removeAt(index: number): void {
    if (index < 0 || index >= rows.length) return;
    const notes = alignNotes(
      rows.map((each) => each.input.value),
      index,
      rows.length - 1,
    );
    rows.forEach((each, at) => {
      if (at < notes.length) each.input.value = notes[at] ?? "";
    });
    options.onRemove(index);
  }

  function fill(row: Row, item: TrayItem, index: number): void {
    const number = String(index + 1);
    const key = `${number}\n${item.label.tag}\n${item.label.name ?? ""}`;
    if (row.key === key) return;
    row.key = key;
    row.num.textContent = number;
    row.tag.textContent = item.label.tag;
    row.name.replaceChildren(row.tag);
    if (item.label.name) row.name.append(` ${item.label.name}`);
    row.name.title = item.label.name ? `${item.label.tag} ${item.label.name}` : item.label.tag;
    row.input.setAttribute("aria-label", `Note for ${number}`);
    row.remove.setAttribute("aria-label", `Remove ${number}`);
  }

  function update(items: TrayItem[]): void {
    while (rows.length > items.length) rows.pop()?.node.remove();
    while (rows.length < items.length) {
      const row = makeRow();
      rows.push(row);
      list.append(row.node);
    }
    items.forEach((item, index) => {
      const row = rows[index];
      if (row) fill(row, item, index);
    });
    copy.textContent = `Copy ${items.length}`;
    if (items.length > 0 && !shown) {
      shown = true;
      const still = baseMatchMedia("(prefers-reduced-motion: reduce)").matches;
      node.classList.toggle("in", !still);
    }
    if (items.length === 0) {
      shown = false;
      node.classList.remove("in");
    }
  }

  function onKey(event: KeyboardEvent): void {
    const target = event.composedPath()[0] ?? null;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (target instanceof HTMLElement) target.blur();
      return;
    }
    if (event.key === "Enter" && !event.isComposing) {
      const command = event.metaKey || event.ctrlKey;
      if (command || (target instanceof HTMLInputElement && !event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        options.onCopy();
        return;
      }
    }
    if (isField(target)) event.stopPropagation();
  }

  function onType(event: KeyboardEvent): void {
    if (isField(event.composedPath()[0] ?? null)) event.stopPropagation();
  }

  /** A press on a button keeps the focus where it was, so grab's keys stay grab's. */
  function onPress(event: MouseEvent): void {
    if (!isField(event.composedPath()[0] ?? null)) event.preventDefault();
  }

  node.addEventListener("mousedown", onPress);
  node.addEventListener("keydown", onKey);
  node.addEventListener("keyup", onType);
  node.addEventListener("keypress", onType);
  copy.addEventListener("click", () => options.onCopy());

  return {
    node,
    update,
    remove: removeAt,
    notes() {
      return { each: rows.map((row) => row.input.value), all: all.value };
    },
    focusNote(index) {
      const field = index === null ? all : rows[index]?.input;
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: "nearest" });
    },
    contains(target) {
      return target instanceof Node && node.contains(target);
    },
    destroy() {
      node.removeEventListener("mousedown", onPress);
      node.removeEventListener("keydown", onKey);
      node.removeEventListener("keyup", onType);
      node.removeEventListener("keypress", onType);
      node.remove();
    },
  };
}
