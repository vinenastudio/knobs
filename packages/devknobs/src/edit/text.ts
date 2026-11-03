/**
 * The edits as text: what the changes list shows, the diff it copies, and
 * the prompt that asks an agent to put them in the code. Several edits of one
 * property in one place come to one change, from the first value to the last,
 * and one that came back to where it started is no change. Nothing here
 * touches the page.
 */

import type { Edit, EditTarget } from "./log";

/** One property's change in one place, from its first value to its last. */
export interface NetChange {
  target: EditTarget;
  property: string;
  before: string | null;
  after: string | null;
}

/** The edits that change one place, in the order the first of them was made. */
export interface ChangeGroup {
  target: EditTarget;
  changes: NetChange[];
}

/** Where an edit is, as one key: the rule, or the element's own style. */
function placeKey(target: EditTarget): string {
  const rule = target.rule;
  return rule ? `rule ${rule.sheet} ${rule.path.join(".")} ${[...rule.context, rule.selectorText].join(" > ")}` : `inline ${target.selector}`;
}

/** The edits as changes by place, each property once, the ones that came to nothing left out. */
export function netChanges(edits: readonly Edit[]): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>();
  const byProperty = new Map<string, NetChange>();
  for (const edit of edits) {
    const key = placeKey(edit.target);
    let group = groups.get(key);
    if (!group) {
      group = { target: edit.target, changes: [] };
      groups.set(key, group);
    }
    // Where the element is written may be known to only some of them.
    group.target = { ...group.target, ...edit.target };
    const at = `${key}\n${edit.property}`;
    const known = byProperty.get(at);
    if (known) known.after = edit.after;
    else {
      const change: NetChange = { target: edit.target, property: edit.property, before: edit.before, after: edit.after };
      byProperty.set(at, change);
      group.changes.push(change);
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, changes: group.changes.filter((one) => one.before !== one.after) }))
    .filter((group) => group.changes.length > 0);
}

/** How many changes the edits come to. */
export function changeCount(edits: readonly Edit[]): number {
  return netChanges(edits).reduce((sum, group) => sum + group.changes.length, 0);
}

/** A stylesheet, as a line names it. */
function sheetName(sheet: string): string {
  if (sheet === "<style>") return "a <style> element";
  if (sheet === "constructed") return "a stylesheet made by script";
  return sheet;
}

/** A rule with what it sits in, outermost first: `@media (min-width: 640px) > .p > &`. */
function ruleChain(rule: NonNullable<EditTarget["rule"]>, quote: string): string {
  return [...rule.context, rule.selectorText].map((one) => `${quote}${one}${quote}`).join(" > ");
}

/** What a group's head says: the rule and its stylesheet, or the element's own style. */
export function placeLine(target: EditTarget): string {
  const rule = target.rule;
  if (rule) return `${ruleChain(rule, "")} { } in ${sheetName(rule.sheet)}`;
  return `style="" on ${target.selector}`;
}

/** A change as diff lines: `- name: before;` and `+ name: after;`, either left out where it is not set. */
export function diffLines(change: Pick<NetChange, "property" | "before" | "after">): string[] {
  const lines: string[] = [];
  if (change.before !== null) lines.push(`- ${change.property}: ${change.before};`);
  if (change.after !== null) lines.push(`+ ${change.property}: ${change.after};`);
  return lines;
}

/** The edits as a plain diff, a head line for each place. */
export function diffText(edits: readonly Edit[]): string {
  return netChanges(edits)
    .map((group) => [placeLine(group.target), ...group.changes.flatMap(diffLines)].join("\n"))
    .join("\n\n");
}

/** The instruction an agent gets after the changes. */
export const KEEP_APPROACH =
  "Keep the project's styling approach (Tailwind classes, CSS modules, styled components or plain CSS): change the styles where they are written, and do not add inline styles unless the change was made to one.";

/** A value in the prompt, or what its absence means. */
function said(value: string | null, absent: string): string {
  return value === null ? absent : value;
}

/** The prompt that asks an agent to put the edits in the code. Empty with none. */
export function promptText(edits: readonly Edit[]): string {
  const groups = netChanges(edits);
  if (groups.length === 0) return "";
  const parts = groups.map((group, index) => {
    const { target } = group;
    const rule = target.rule;
    const lines = [`${index + 1}. Element \`${target.selector}\``];
    if (target.source) lines.push(`   Source: ${target.source}`);
    if (rule) lines.push(`   Rule: ${ruleChain(rule, "`")} in ${sheetName(rule.sheet)}`);
    else lines.push("   In the element's inline style");
    for (const change of group.changes) {
      lines.push(`   ${change.property}: ${said(change.before, "(not set)")} -> ${said(change.after, "(removed)")}`);
    }
    return lines.join("\n");
  });
  return ["Apply these style changes in the source code:", "", parts.join("\n\n"), "", KEEP_APPROACH].join("\n");
}
