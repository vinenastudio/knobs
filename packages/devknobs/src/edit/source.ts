/**
 * Where an edited element is written, found as grab finds it: the app's file
 * and line of the component that rendered it, through the page's source maps.
 * It comes in after the edit is recorded, and fills in its target then. Grab
 * loads only the first time an edit asks for it.
 */

import type { Change, Edit, EditLog } from "./log";

/** The file and line an element is written at, `file:line`, or null where none is found. */
export type Locate = (element: Element) => Promise<string | null>;

const found = new WeakMap<Element, Promise<string | null>>();

export const locateSource: Locate = (element) => {
  let pending = found.get(element);
  if (!pending) {
    pending = import("../grab/context")
      .then(({ grabEntry }) => grabEntry(element))
      .then(({ source }) => {
        if (!source || source.origin !== "app") return null;
        return source.lineNumber ? `${source.filePath}:${source.lineNumber}` : source.filePath;
      })
      .catch(() => null);
    found.set(element, pending);
  }
  return pending;
};

/** Record a change, and once it is known, where the element it is for is written. */
export function recordAt(log: EditLog, change: Change, element: Element, locate: Locate = locateSource): Edit | null {
  const edit = log.record(change);
  if (!edit) return null;
  void locate(element).then((source) => {
    if (source) log.locate(edit.id, { source });
  });
  return edit;
}
