import type { GrabEntry, GrabPayload } from "./types";

/** What a copy takes: the gathered elements, in order, and the one clicked last if it is new. */
export function flushPicks<T>(picked: readonly T[], clicked: T | null): T[] {
  if (clicked === null || picked.includes(clicked)) return [...picked];
  return [...picked, clicked];
}

/** What the toast says: `Copied`, or `Copied 3` for more than one. */
export function copiedText(count: number): string {
  return count > 1 ? `Copied ${count}` : "Copied";
}

function cleanNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The text a copy of the picks puts on the clipboard. One element with no note is its
 * line alone. Otherwise each element is numbered, and the note goes last after a blank line.
 */
export function formatPicks(entries: readonly GrabEntry[], note?: string): string {
  const clean = cleanNote(note);
  const only = entries.length === 1 ? entries[0] : undefined;
  if (only && !clean) return only.content;
  const blocks = entries.map((entry, index) => `${index + 1}. ${entry.content}`);
  if (clean) blocks.push(`${blocks.length > 0 ? "\n" : ""}Note: ${clean}`);
  return blocks.join("\n");
}

/** A payload from the picks and the tray's note. An empty note is left out. */
export function picksPayload(entries: readonly GrabEntry[], note?: string): GrabPayload {
  const clean = cleanNote(note);
  const content = formatPicks(entries, clean);
  return clean ? { content, entries: [...entries], note: clean } : { content, entries: [...entries] };
}
