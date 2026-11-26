import type { GrabEntry, GrabPayload } from "./types";

/** Indent for a note under a numbered element. */
const NOTE_INDENT = "   ";

/**
 * Shift and a click gather elements, and a click again takes one back out.
 * They are copied together with a plain click, Enter, C or the tray's button.
 */
export function togglePick<T>(picked: readonly T[], item: T): T[] {
  return picked.includes(item) ? picked.filter((entry) => entry !== item) : [...picked, item];
}

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
 * line alone. Otherwise each element is numbered, its note on the next line under it,
 * and the note for all goes last after a blank line.
 */
export function formatPicks(entries: readonly GrabEntry[], note?: string): string {
  const overall = cleanNote(note);
  const only = entries.length === 1 ? entries[0] : undefined;
  if (only && !cleanNote(only.note) && !overall) return only.content;
  const blocks = entries.map((entry, index) => {
    const line = `${index + 1}. ${entry.content}`;
    const own = cleanNote(entry.note);
    if (!own) return line;
    return `${line}\n${NOTE_INDENT}Note: ${own.split("\n").join(`\n${NOTE_INDENT}`)}`;
  });
  if (overall) blocks.push(`${blocks.length > 0 ? "\n" : ""}Note: ${overall}`);
  return blocks.join("\n");
}

/** A payload from the picks and the tray's notes, one per pick and one for all. Empty notes are left out. */
export function picksPayload(
  entries: readonly GrabEntry[],
  notes: readonly (string | undefined)[] = [],
  note?: string,
): GrabPayload {
  const noted = entries.map((entry, index) => {
    const { note: _old, ...rest } = entry;
    const own = cleanNote(notes[index]);
    return own ? { ...rest, note: own } : rest;
  });
  const overall = cleanNote(note);
  const content = formatPicks(noted, overall);
  return overall ? { content, entries: noted, note: overall } : { content, entries: noted };
}
