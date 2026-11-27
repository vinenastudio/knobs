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

/**
 * What the toast says once the copy and the send are done, and whether that went well.
 * Null where the first toast still holds: a copy with no target.
 */
export function settledText(count: number, copied: boolean, sent: boolean | null): { text: string; good: boolean } | null {
  if (sent === true) return { text: copied ? `${copiedText(count)} · Sent` : "Sent", good: true };
  if (sent === false) return { text: copied ? "Send failed" : "Copy and send failed", good: false };
  return copied ? null : { text: "Copy failed", good: false };
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
