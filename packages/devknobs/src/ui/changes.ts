/**
 * The changes at the foot of the Elements view: how many edits are in force,
 * each as a `-` line before and a `+` line after under the place it is in,
 * and the ways to hand them on: the prompt for an agent, the diff, and undo
 * all. It shows only while there is a change. To use it:
 *
 *   const changes = createChanges(edits, copy);
 *   view.append(changes.node); changes.destroy();
 */

import type { EditLog } from "../edit/log";
import { changeCount, diffLines, diffText, netChanges, placeLine, promptText } from "../edit/text";
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
export const AGENT_NOTE = "agents read the edits with devknobs.edits()";

export interface Changes {
  node: HTMLElement;
  destroy(): void;
}

/** What the head says of the keys that undo and redo: `Z` and `⇧Z` on a Mac, `Z` and `Shift Z` elsewhere. */
export function undoHint(mac: boolean): string {
  const undo = comboLabel({ meta: false, ctrl: false, shift: false, alt: false, key: "z" }, mac);
  return `undo ${undo}, redo ${comboLabel(withShift("z"), mac)}`;
}

export function createChanges(log: EditLog, copy: Copy, mac = isMac()): Changes {
  const node = el("section", "changes");
  node.setAttribute("aria-label", "changes");
  const head = el("div", "changes-head");
  const list = el("div", "changes-list");
  const prompt = button("chip changes-go", "copy prompt for agent");
  const diff = button("chip", "copy diff");
  const undoAll = button("chip", "undo all");
  const acts = el("div", "changes-acts");
  acts.append(prompt, diff, undoAll);
  node.append(head, list, acts, el("div", "changes-note", AGENT_NOTE));
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
    node.hidden = count === 0;
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
  draw();

  return {
    node,
    destroy(): void {
      gone = true;
      stop();
      for (const timer of timers.values()) clearTimeout(timer);
    },
  };
}
