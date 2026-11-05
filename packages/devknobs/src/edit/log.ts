/**
 * The edits made on the page from the panel, in the order they were made,
 * with undo and redo. An edit is plain data an agent can read and put in the
 * code: what it changed, where that is written, and the value before and
 * after. Each one is recorded with its own way to apply and revert itself on
 * the live page, which never leaves this module. To use it:
 *
 *   const edit = edits.record(change);   // applies it, or null where it did not take
 *   edits.undo(); edits.redo(); edits.undoAll();
 *   edits.list();                        // the edits in force, as plain data
 *
 * A new kind of edit only brings its own `Change`: the log stays the same.
 */

/**
 * What an edit changes: a css declaration's value, a declaration turned off
 * or on, a property added, a new rule, or in the html a text, an attribute,
 * an element written anew as html, an element hidden, a node deleted, an
 * element moved.
 */
export type EditKind = "css-value" | "css-toggle" | "css-add" | "css-rule" | "text" | "attr" | "html" | "hide" | "delete" | "move";

/** Where a moved element stands, as selectors read before the move: the element it is in, and the one it stands before, null at the end. */
export interface EditPlace {
  parent: string;
  next: string | null;
}

/** Where an edit is, for an agent to find it in the code. */
export interface EditTarget {
  /** A css selector that finds the element on the page. */
  selector: string;
  /** Where the element is written, `file:line`, when grab's source lookup finds it. */
  source?: string;
  /** The rule the edit is in. Left out for an edit of the element's own `style`. */
  rule?: {
    selectorText: string;
    /** The stylesheet's address, `<style>` for an inline one, `constructed` for an adopted one, `new rule` for a rule the panel added. */
    sheet: string;
    /** The element that brought the stylesheet in, as `style#theme`. Null for an adopted one. */
    owner: string | null;
    /** Tells stylesheets apart on the page, two `<style>` elements say, for as long as it is up. */
    sheetId: number;
    /** Its index in the stylesheet, then in each rule around it, outermost first. */
    path: number[];
    /** What it sits in, outermost first: `@media (min-width: 640px)`, `@layer base`, the selector of a rule it is nested in. */
    context: string[];
  };
}

export interface Edit {
  id: number;
  kind: EditKind;
  target: EditTarget;
  /**
   * What in its place it changes: the css property, as written, `rule` for
   * a new rule, whose selector is its value after, the attribute's name, `text` for the element's text (`text 2` for its second
   * text), `html` for its markup, `hidden` for a hide, `node` for a delete and a move.
   */
  property: string;
  /** The value before, `!important` and all, or null where it was not set. For `html` and `delete`, the markup. For `move`, where it stood, in words. */
  before: string | null;
  /** The value after, or null where the edit took it away. For `move`, where it stands now, in words. */
  after: string | null;
  /** For a move: where the element stood. */
  from?: EditPlace;
  /** For a move: where it stands now. */
  to?: EditPlace;
}

/** An edit and how it goes on and off the page. */
export interface Change {
  edit: Omit<Edit, "id">;
  /** Put the edit on the page. False where the page did not take it, as for a value that is no css. */
  apply(): boolean;
  /** Take it off again. */
  revert(): void;
  /**
   * The window of the page it is on. When that page goes, as a frame
   * reloads, the edit stays in the log as text, and lets go of the page:
   * undoing it then only takes it out of the log.
   */
  view?: Window | null;
}

/** An edit as recorded, with what it was recorded from. */
export interface Recorded {
  edit: Edit;
  change: Change;
  /** The window the edit was made in, as it was recorded: it stays when the change lets go of its page. */
  readonly view: Window | null;
}

export interface EditLog {
  /** Apply a change and record it. Null where it did not take, and then nothing is recorded. */
  record(change: Change): Edit | null;
  /** Revert the last edit in force. Null with none. */
  undo(): Edit | null;
  /** Apply again the last edit undone, until a new one is recorded. Null with none, or where the page no longer takes it: that edit is dropped. */
  redo(): Edit | null;
  /** Revert every edit, the last first, and forget them. Says how many there were. */
  undoAll(): number;
  /** The edits in force, oldest first, as plain data. */
  list(): Edit[];
  /** The edits in force with their changes, oldest first. Not a copy: read only. */
  recorded(): readonly Recorded[];
  /** Fill in what was found out about an edit's target later, as its source. */
  locate(id: number, patch: Partial<EditTarget>): void;
  /** Hear the edits change. Returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

function copy(edit: Edit): Edit {
  const target: EditTarget = { ...edit.target };
  const rule = edit.target.rule;
  if (rule) target.rule = { ...rule, path: [...rule.path], context: [...rule.context] };
  const copied: Edit = { ...edit, target };
  if (edit.from) copied.from = { ...edit.from };
  if (edit.to) copied.to = { ...edit.to };
  return copied;
}

/** A change whose page went: text alone, which can neither go on nor come off again. */
function gone(change: Change): Change {
  return { edit: change.edit, apply: () => false, revert: () => undefined, view: null };
}

export function createEditLog(): EditLog {
  const done: Recorded[] = [];
  const undone: Recorded[] = [];
  const listeners = new Set<() => void>();
  let ids = 0;
  /** The windows a pagehide is heard on. */
  const watched = new WeakSet<Window>();

  /** A page with edits went: its edits let go of it. */
  function leave(view: Window): void {
    for (const one of [...done, ...undone]) if (one.change.view === view) one.change = gone(one.change);
  }

  function watch(view: Window | null | undefined): void {
    if (!view || watched.has(view)) return;
    watched.add(view);
    try {
      const onHide = (event: Event): void => {
        // A page kept for back and forward comes back as it was, its edits on it.
        if (Reflect.get(event, "persisted") === true) return;
        view.removeEventListener("pagehide", onHide);
        watched.delete(view);
        leave(view);
      };
      view.addEventListener("pagehide", onHide);
    } catch {
      // A window that will not be listened to keeps its edits live.
    }
  }

  function tell(): void {
    for (const listener of Array.from(listeners)) listener();
  }

  function revert(one: Recorded): void {
    try {
      one.change.revert();
    } catch {
      // What it was on left the page: there is nothing to take back.
    }
  }

  function apply(one: Recorded): boolean {
    try {
      return one.change.apply();
    } catch {
      return false;
    }
  }

  return {
    record(change) {
      const one: Recorded = { edit: { id: ++ids, ...change.edit }, change, view: change.view ?? null };
      if (!apply(one)) return null;
      watch(change.view);
      done.push(one);
      undone.length = 0;
      tell();
      return copy(one.edit);
    },
    undo() {
      const one = done.pop();
      if (!one) return null;
      revert(one);
      undone.push(one);
      tell();
      return copy(one.edit);
    },
    redo() {
      const one = undone.pop();
      if (!one) return null;
      const took = apply(one);
      if (took) done.push(one);
      tell();
      return took ? copy(one.edit) : null;
    },
    undoAll() {
      const count = done.length;
      if (count === 0 && undone.length === 0) return 0;
      // The last first, each out of the log before it reverts, so it sees the page as it was made on.
      for (let one = done.pop(); one; one = done.pop()) revert(one);
      undone.length = 0;
      tell();
      return count;
    },
    list: () => done.map((one) => copy(one.edit)),
    recorded: () => done,
    locate(id, patch) {
      const one = [...done, ...undone].find((each) => each.edit.id === id);
      if (!one) return;
      one.edit.target = { ...one.edit.target, ...patch };
      tell();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The page's one log, which the panel's views, reset and `devknobs.edits()` share. */
export const edits: EditLog = createEditLog();
