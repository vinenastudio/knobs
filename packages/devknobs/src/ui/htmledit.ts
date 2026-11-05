/**
 * The editor of the tree's "edit as html": a text box over the same text
 * colored as html (tags, attributes, values, comments), the two kept in step
 * as it scrolls, with the line numbers beside it. A line wider than the box
 * wraps, in the text and its colors alike, and its number stands at its
 * first row. It types as a code editor:
 *
 *   ↩        a new line with the line's indent, one more after an opening tag
 *   >        closes the tag it ends, `<div>` making `<div></div>`, but a void one
 *   " '      a pair of quotes after `=` in a tag, and over the closing one
 *
 * Its height is dragged by the grip under it, and the expand button makes
 * it as tall as the panel. Both are kept as `size` says. The field around it
 * puts its edit on and leaves, as domedit.ts says. To use it:
 *
 *   const editor = htmlEditor(markup, label, size);
 *   row.append(editor.frame); editor.shown(); editor.area.value; editor.restore();
 */

import { button, el } from "./dom";
import { HTML_MIN, type HtmlSize } from "./prefs";

/** How much a level of html is indented. */
export const INDENT = "  ";

/** Elements that have no end tag. */
export const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** A piece of html as the editor colors it. */
export interface HtmlToken {
  kind: "tag" | "attr" | "val" | "com" | "doc" | "text";
  text: string;
}

/**
 * Html cut into the pieces it is colored by: a tag's name and its marks, an
 * attribute's name and its value, a comment, a doctype, and the text between.
 * What is not closed yet runs to the end, so a half-typed tag colors too.
 */
export function htmlTokens(text: string): HtmlToken[] {
  const out: HtmlToken[] = [];
  const push = (kind: HtmlToken["kind"], piece: string): void => {
    if (piece === "") return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += piece;
    else out.push({ kind, text: piece });
  };
  let at = 0;
  while (at < text.length) {
    if (text.startsWith("<!--", at)) {
      const end = text.indexOf("-->", at + 4);
      const to = end < 0 ? text.length : end + 3;
      push("com", text.slice(at, to));
      at = to;
      continue;
    }
    const name = /^<\/?[A-Za-z][\w:.-]*/.exec(text.slice(at));
    if (!name) {
      if (text.startsWith("<!", at)) {
        const end = text.indexOf(">", at);
        const to = end < 0 ? text.length : end + 1;
        push("doc", text.slice(at, to));
        at = to;
        continue;
      }
      const next = text.indexOf("<", at + 1);
      const to = next < 0 ? text.length : next;
      push("text", text.slice(at, to));
      at = to;
      continue;
    }
    push("tag", name[0]);
    at += name[0].length;
    // The attributes, up to the tag's end.
    while (at < text.length && text[at] !== ">") {
      const rest = text.slice(at);
      const space = /^\s+/.exec(rest);
      if (space) {
        push("text", space[0]);
        at += space[0].length;
        continue;
      }
      if (rest.startsWith("/")) {
        push("tag", "/");
        at += 1;
        continue;
      }
      if (rest.startsWith("=")) {
        push("text", "=");
        at += 1;
        const quote = text[at];
        if (quote === '"' || quote === "'") {
          const end = text.indexOf(quote, at + 1);
          const to = end < 0 ? text.length : end + 1;
          push("val", text.slice(at, to));
          at = to;
        } else {
          const bare = /^[^\s>]*/.exec(text.slice(at))?.[0] ?? "";
          push("val", bare);
          at += bare.length;
        }
        continue;
      }
      const attr = /^[^\s"'>/=]+/.exec(rest)?.[0] ?? rest.charAt(0);
      push(/^["']/.test(attr) ? "val" : "attr", attr);
      at += attr.length;
    }
    if (text[at] === ">") {
      push("tag", ">");
      at += 1;
    }
  }
  return out;
}

/** What a key types in place of the selection: `insert`, and where the caret goes from its start, past it where nothing is typed. */
export interface Typed {
  insert: string;
  caret: number;
}

/** A tag opened before the caret and not closed yet: its name, where its attributes' quotes are all closed. */
const OPEN_TAG = /<([A-Za-z][\w:.-]*)(?:\s(?:[^<>"']|"[^"]*"|'[^']*')*)?$/;

/** The tag a line ends with, opened: its name. */
const OPENED = /<([A-Za-z][\w:.-]*)(?:\s(?:[^<>"']|"[^"]*"|'[^']*')*)?>\s*$/;

/** Whether a tag of this name is closed: not a void one. */
function closes(name: string): boolean {
  return !VOID_ELEMENTS.has(name.toLowerCase());
}

/**
 * What a key does to the editor's text, typed at `start` to `end`, or null
 * for the browser's own: ↩ keeps the line's indent, ">" closes a tag, a quote
 * pairs after `=` in a tag and steps over the closing one.
 */
export function typedKey(text: string, start: number, end: number, key: string): Typed | null {
  const before = text.slice(0, start);
  if (key === "Enter") {
    const line = before.slice(before.lastIndexOf("\n") + 1);
    const indent = /^[ \t]*/.exec(line)?.[0] ?? "";
    const opened = OPENED.exec(line);
    if (!opened?.[1] || !closes(opened[1]) || /\/>\s*$/.test(line)) return { insert: `\n${indent}`, caret: indent.length + 1 };
    const inner = `\n${indent}${INDENT}`;
    // Between a tag and its end tag, the end goes on a line of its own.
    if (new RegExp(`^\\s*</${opened[1]}\\s*>`, "i").test(text.slice(end))) return { insert: `${inner}\n${indent}`, caret: inner.length };
    return { insert: inner, caret: inner.length };
  }
  if (start !== end) return null;
  if (key === ">") {
    const open = OPEN_TAG.exec(before);
    if (!open?.[1] || before.endsWith("/") || !closes(open[1])) return null;
    return { insert: `></${open[1]}>`, caret: 1 };
  }
  if (key === '"' || key === "'") {
    // The quote that closes a value typed in: the caret steps over it.
    const inValue = new RegExp(`<[A-Za-z][^<>]*=\\s*${key}[^${key}]*$`).test(before) && !OPEN_TAG.test(before);
    if (inValue && text[start] === key) return { insert: "", caret: 1 };
    if (OPEN_TAG.test(before) && /=\s*$/.test(before)) return { insert: `${key}${key}`, caret: 1 };
  }
  return null;
}

/** A text's tokens by line, each cut where it has a line break, so a line wraps as a block of its own. */
export function tokenLines(text: string): HtmlToken[][] {
  const lines: HtmlToken[][] = [[]];
  for (const token of htmlTokens(text)) {
    token.text.split("\n").forEach((piece, at) => {
      if (at > 0) lines.push([]);
      if (piece !== "") lines[lines.length - 1]?.push({ kind: token.kind, text: piece });
    });
  }
  return lines;
}

export interface HtmlEditor {
  /** The editor, what goes in the line. */
  frame: HTMLElement;
  /** The text box, the field itself. */
  area: HTMLTextAreaElement;
  /** The editor is on the page: it takes the size it was left at. */
  shown(): void;
  /** The editor goes: the tree's box gets back the height it had. */
  restore(): void;
}

/** What the editor needs of where it stands, so a test can stand in for the panel. */
interface Around {
  /** The tree's box, which grows to show the whole editor. */
  box: HTMLElement | null;
  /** The view's body, whose height is the panel's. */
  body: HTMLElement | null;
  /** How tall the bar of actions is that stays at the foot of the tree's box, over its lines. */
  bar: number;
  /** How tall the changes are that stay at the foot of the view's body, over what scrolls. */
  foot: number;
}

function around(frame: HTMLElement): Around {
  const closest = (selector: string): HTMLElement | null => {
    const found: unknown = frame.closest?.(selector);
    return found ? (found as HTMLElement) : null;
  };
  const box = closest(".dom");
  const body = closest(".view-body");
  const height = (node: unknown): number => (node ? Number(Reflect.get(node, "offsetHeight")) || 0 : 0);
  return { box, body, bar: height(box?.querySelector?.(".dom-acts")), foot: height(body?.querySelector?.(".changes")) };
}

/**
 * Insert text in place of the selection, as typing does, so the browser's undo
 * takes it back. True where the browser put it in, which says so with `input`.
 */
function insertText(area: HTMLTextAreaElement, insert: string): boolean {
  if (insert === "") return false;
  const doc: unknown = area.ownerDocument;
  const exec: unknown = doc ? Reflect.get(doc, "execCommand") : null;
  if (typeof exec === "function" && Reflect.apply(exec, doc, ["insertText", false, insert]) === true) return true;
  area.setRangeText(insert, area.selectionStart, area.selectionEnd, "end");
  return false;
}

/** The editor for `value`, its size from `size`, which keeps what the user sets. */
export function htmlEditor(value: string, label: string, size: { get(): HtmlSize; set(next: HtmlSize): void } | null = null): HtmlEditor {
  const frame = el("div", "html-ed");
  const body = el("div", "html-ed-body");
  const code = el("div", "html-ed-code");
  const shade = el("pre", "html-ed-hl");
  shade.setAttribute("aria-hidden", "true");
  const colored = el("div", "html-ed-inner");
  shade.append(colored);
  const area = document.createElement("textarea");
  area.className = "css-edit inline-field dom-edit dom-html";
  area.value = value;
  area.spellcheck = false;
  area.setAttribute("aria-label", label);
  code.append(shade, area);
  body.append(code);
  const foot = el("div", "html-ed-foot");
  const grip = el("div", "html-ed-grip");
  grip.setAttribute("role", "separator");
  grip.setAttribute("aria-orientation", "horizontal");
  grip.setAttribute("aria-label", "drag to resize the html editor");
  const expand = button("chip html-ed-expand", "expand");
  foot.append(grip, expand);
  frame.append(body, foot);
  let now: HtmlSize = size?.get() ?? { height: 200, full: false };
  /** The tree's box the editor grew, and its own height before. */
  let boxWas: { box: HTMLElement; height: string; maxHeight: string } | null = null;

  /**
   * Each line is its number and its colored text, in a grid whose rows are
   * as tall as the text wraps to. The gutter is as wide as the last number,
   * and the text box starts its lines past it, so both wrap at one width.
   */
  function paint(): void {
    const lines = tokenLines(area.value);
    const gutter = `calc(${String(lines.length).length}ch + 2 * var(--col-pad))`;
    colored.style.gridTemplateColumns = `${gutter} minmax(0, 1fr)`;
    area.style.paddingLeft = `calc(${gutter} + var(--col-pad))`;
    code.style.backgroundSize = `${gutter} 100%`;
    colored.replaceChildren(
      ...lines.flatMap((tokens, at) => {
        const text = el("span", "html-ed-text");
        text.append(...tokens.map((token) => el("span", `tok-${token.kind}`, token.text)));
        return [el("span", "html-ed-num", String(at + 1)), text];
      }),
    );
    follow();
  }

  /** The colored text and its numbers scroll with the box. */
  function follow(): void {
    colored.style.transform = `translateY(${-area.scrollTop || 0}px)`;
  }

  /** How tall the apply button after the editor is. */
  function applyHeight(): number {
    const next: unknown = frame.nextElementSibling;
    return next ? Number(Reflect.get(next, "offsetHeight")) || 0 : 0;
  }

  /** The most the box may be: the panel's body less what goes round it, the apply button after it too. */
  function most(where: Around): number {
    const panel = where.body?.clientHeight ?? 0;
    if (!panel) return Number.POSITIVE_INFINITY;
    return Math.max(HTML_MIN, panel - (frame.offsetHeight - body.offsetHeight) - applyHeight() - where.bar - where.foot - 16);
  }

  /** Grow the tree's box until it shows the whole editor, up to the panel's height, and give back what it no longer needs. */
  function fit(where: Around): void {
    const { box, body: view } = where;
    if (!box || !view || typeof frame.getBoundingClientRect !== "function") return;
    giveBack();
    const top = frame.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const needed = top + frame.offsetHeight + applyHeight() + where.bar + 12;
    if (needed <= box.clientHeight) return;
    boxWas ??= { box, height: box.style.height, maxHeight: box.style.maxHeight };
    box.style.maxHeight = "none";
    box.style.height = `${Math.min(needed, view.clientHeight - where.foot)}px`;
  }

  /** The tree's box gets back the height it had. */
  function giveBack(): void {
    if (boxWas) {
      boxWas.box.style.height = boxWas.height;
      boxWas.box.style.maxHeight = boxWas.maxHeight;
    }
    boxWas = null;
  }

  /** Bring the whole editor into sight, its top at the top of the panel's body. */
  function reveal(where: Around): void {
    const { box, body: view } = where;
    if (!box || !view || typeof frame.getBoundingClientRect !== "function") return;
    box.scrollTop += frame.getBoundingClientRect().top - box.getBoundingClientRect().top - 4;
    view.scrollTop += box.getBoundingClientRect().top - view.getBoundingClientRect().top;
  }

  function apply(next: HtmlSize, keep: boolean): void {
    now = next;
    const where = around(frame);
    const room = most(where);
    // With no panel measured yet, expanded keeps the height kept.
    body.style.height = `${Math.round(next.full && Number.isFinite(room) ? room : Math.min(next.height, room))}px`;
    expand.textContent = next.full ? "shrink" : "expand";
    expand.setAttribute("aria-pressed", String(next.full));
    fit(where);
    if (next.full) reveal(where);
    if (keep) size?.set(next);
  }

  area.addEventListener("input", paint);
  area.addEventListener("scroll", follow);
  area.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || (event.key === "Enter" && event.shiftKey)) return;
    const typed = typedKey(area.value, area.selectionStart ?? 0, area.selectionEnd ?? 0, event.key);
    if (!typed) return;
    event.preventDefault();
    const start = area.selectionStart ?? 0;
    const heard = insertText(area, typed.insert);
    area.setSelectionRange(start + typed.caret, start + typed.caret);
    if (!heard) paint();
  });
  // A press on the editor's own parts keeps the focus in the text, which would put the edit on as it left.
  frame.addEventListener("pointerdown", (event: Event) => {
    if (event.target !== area) event.preventDefault();
  });
  expand.addEventListener("click", (event: Event) => {
    event.stopPropagation();
    apply({ height: now.height, full: !now.full }, true);
  });
  grip.addEventListener("pointerdown", (event: PointerEvent) => {
    const from = event.clientY;
    const was = body.offsetHeight;
    grip.setPointerCapture?.(event.pointerId);
    const move = (next: PointerEvent): void => {
      apply({ height: Math.max(HTML_MIN, was + next.clientY - from), full: false }, false);
    };
    const up = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      apply({ height: body.offsetHeight || now.height, full: false }, true);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  });
  paint();

  return {
    frame,
    area,
    shown: () => apply(now, false),
    restore: giveBack,
  };
}
