/**
 * The changes at the foot of the Elements view: how many edits are in force,
 * each as a `-` line before and a `+` line after under the place it is in,
 * and the ways to hand them on: the prompt for an agent, the diff, and undo
 * all. With edits kept after a reload, a line says how many were made again
 * as the page loaded and lists those that were not, one says when edits
 * past the caps are not kept, and kept html and attribute edits wait there,
 * listed, for a click on their `apply`: they could change what a script of
 * the page does, so only the user makes them again. It shows only while there is something to say. To use it:
 *
 *   const changes = createChanges(edits, copy, isMac(), keeper());
 *   view.append(changes.node); changes.destroy();
 */

import { type Keeper, readSavedEdit, type SavedEdit, type Skipped } from "../edit/keep";
import type { EditLog } from "../edit/log";
import { changeCount, data, diffLines, diffText, netChanges, placeLine, promptText } from "../edit/text";
import { isMac } from "../engine/ua";
import { button, el } from "./dom";
import { comboLabel, withShift } from "./keys";

/** What the copy buttons say for a moment after a copy, and after one that did not go. */
export const COPIED = "copied";
export const NOT_COPIED = "could not copy";

/** Copies a text, and says whether it went, at once or once the clipboard answers. */
export type Copy = (text: string) => boolean | Promise<boolean>;

/** How long a copy button says it copied, in ms. */
const COPIED_FOR = 1200;

/** What the line under the buttons says, for agents that run code in the page. */
export const AGENT_NOTE = "agents read and apply edits: devknobs.edits() / setEdits()";

/** What the line about edits made again as the page loaded says. */
export function keptLine(kept: number, missed: number): string {
  const made = `${kept} ${kept === 1 ? "edit" : "edits"} kept from before the reload`;
  return missed > 0 ? `${made}, ${missed} could not be found` : made;
}

/** What the line over the kept edits that wait says: how many html and attribute edits, and the edits after them. */
export function waitLine(html: number, attributes: number, more: number): string {
  const parts: string[] = [];
  if (html > 0) parts.push(`${html} kept html ${html === 1 ? "edit" : "edits"}`);
  if (attributes > 0) parts.push(`${attributes} kept attribute ${attributes === 1 ? "edit" : "edits"}`);
  const said = `${parts.join(" and ")} ${html + attributes === 1 ? "waits" : "wait"}`;
  return more > 0 ? `${said}, with ${more} ${more === 1 ? "edit" : "edits"} after them` : said;
}

/** What the line under them says: a page script may have planted them. */
export const WAIT_NOTE = "apply only edits you made on this page";

/** The most characters a waiting edit's value shows, cut at its end. */
export const WAIT_MAX = 120;

/** What a waiting edit makes, as apply would: the markup, `name="value"`, or the value after, cut short, as data. */
export function waitValue(edit: SavedEdit): string {
  const after = edit.after === null ? "(removed)" : edit.kind === "attr" ? `${edit.property}="${edit.after}"` : edit.after;
  const chars = [...after];
  return data(chars.length > WAIT_MAX ? `${chars.slice(0, WAIT_MAX - 1).join("")}…` : after);
}

/** An edit that was not made again, or waits: `text on h1.title`, then why where it was not made. */
function editLine(value: unknown): string | null {
  const edit = readSavedEdit(value);
  if (!edit) return null;
  const what = edit.kind === edit.property || edit.kind.startsWith("css-") || edit.kind === "attr" ? data(edit.property) : edit.kind;
  return `${what} on ${data(edit.target.selector)}`;
}

/** An edit that was not made again, as its line says it: `text on h1.title: not found on the page`, `padding on a.cta: ...`. */
export function missedLine(skipped: Skipped): string {
  const line = editLine(skipped.edit);
  return line ? `${line}: ${skipped.reason}` : skipped.reason;
}

export interface Changes {
  node: HTMLElement;
  destroy(): void;
}

/** What the head says of the keys that undo and redo: `Z` and `⇧Z` on a Mac, `Z` and `Shift Z` elsewhere. */
export function undoHint(mac: boolean): string {
  const undo = comboLabel({ meta: false, ctrl: false, shift: false, alt: false, key: "z" }, mac);
  return `undo ${undo}, redo ${comboLabel(withShift("z"), mac)}`;
}

export function createChanges(log: EditLog, copy: Copy, mac = isMac(), keep: Keeper | null = null): Changes {
  const node = el("section", "changes");
  node.setAttribute("aria-label", "changes");
  const head = el("div", "changes-head");
  const kept = el("div", "changes-kept");
  const apply = button("chip changes-apply", "apply");
  // Only the user's own click on this button makes the kept html edits: a page script's click is no trusted one.
  apply.addEventListener("click", (event: Event) => {
    if (event.isTrusted && event.currentTarget === apply) keep?.applyWaiting();
  });
  const list = el("div", "changes-list");
  const prompt = button("chip changes-go", "copy prompt for agent");
  const diff = button("chip", "copy diff");
  const undoAll = button("chip", "undo all");
  const acts = el("div", "changes-acts");
  acts.append(prompt, diff, undoAll);
  node.append(head, kept, list, acts, el("div", "changes-note", AGENT_NOTE));
  const timers = new Map<HTMLButtonElement, number>();
  const labels = new Map<HTMLButtonElement, string>();
  /** The section went: a copy that answers after that changes nothing. */
  let gone = false;

  /** Copy a text, and let the button say for a moment whether it went. */
  async function copied(control: HTMLButtonElement, text: string): Promise<void> {
    if (text === "") return;
    const label = labels.get(control) ?? control.textContent ?? "";
    labels.set(control, label);
    let went = false;
    try {
      went = await copy(text);
    } catch {
      went = false;
    }
    if (gone) return;
    control.textContent = went ? COPIED : NOT_COPIED;
    clearTimeout(timers.get(control));
    timers.set(
      control,
      window.setTimeout(() => {
        control.textContent = label;
      }, COPIED_FOR),
    );
  }

  prompt.addEventListener("click", () => void copied(prompt, promptText(log.list())));
  diff.addEventListener("click", () => void copied(diff, diffText(log.list())));
  undoAll.addEventListener("click", () => log.undoAll());

  function draw(): void {
    const edits = log.list();
    const count = changeCount(edits);
    const restored = keep?.restored() ?? null;
    const cut = keep?.cut() ?? 0;
    const said: HTMLElement[] = [];
    if (restored) {
      said.push(el("div", "changes-kept-line", keptLine(restored.kept, restored.missed.length)));
      for (const one of restored.missed) said.push(el("div", "changes-missed", missedLine(one)));
    }
    const waiting = keep?.waiting() ?? [];
    if (waiting.length > 0) {
      const html = waiting.filter((one) => one.kind === "html").length;
      const attributes = waiting.filter((one) => one.kind === "attr").length;
      const head = el("div", "changes-kept-line changes-wait", `${waitLine(html, attributes, waiting.length - html - attributes)}: `);
      head.append(apply);
      said.push(head, el("div", "changes-kept-line changes-wait-note", WAIT_NOTE));
      // Each with what apply makes, as text: the user sees the markup and the values before making them.
      for (const one of waiting) said.push(el("div", "changes-missed", `${editLine(one) ?? ""}: ${waitValue(one)}`));
    }
    if (cut > 0) said.push(el("div", "changes-kept-line", `only the first ${keep?.kept() ?? 0} edits are kept after a reload`));
    kept.replaceChildren(...said);
    kept.hidden = said.length === 0;
    node.hidden = count === 0 && said.length === 0;
    head.textContent = `changes (${count}) · ${undoHint(mac)}`;
    const lines: HTMLElement[] = [];
    for (const group of netChanges(edits)) {
      lines.push(el("div", "diff-place", placeLine(group.target, group.markup)));
      for (const change of group.changes) {
        for (const text of diffLines(change)) lines.push(el("div", text.startsWith("-") ? "diff-del" : "diff-add", text));
      }
    }
    list.replaceChildren(...lines);
  }

  const stop = log.subscribe(draw);
  const stopKeep = keep?.subscribe(draw) ?? null;
  draw();

  return {
    node,
    destroy(): void {
      gone = true;
      stop();
      stopKeep?.();
      for (const timer of timers.values()) clearTimeout(timer);
    },
  };
}
