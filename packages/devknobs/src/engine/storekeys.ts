/**
 * The names of the items knobs keeps in web storage. Each is `knobs` or
 * `knobs:<name>`, and was `devknobs` or `devknobs:<name>` before the rename.
 * An old copy (an npm copy before 0.8, or the 0.7 extension) and a new copy
 * can share one origin. The old copy reads and writes the old name only, and
 * a new copy writes both names with one value, so where the two differ, the
 * old copy wrote last. While both are written, the old name is the truth: a
 * read takes the old item, a write puts the old item first and then the new
 * one, a remove drops both, and an item is listed only where its old name is.
 *
 * Writing the old items goes away two minor releases after 0.8. That release
 * must copy each old item to its new name once, then read the new name only,
 * and drop the old item on every write, so a stale old item never comes back.
 */

const NAME = "knobs";
const OLD_NAME = "devknobs";

/** A key as a copy before the rename wrote it: `knobs:x` was `devknobs:x`. */
export function oldKey(key: string): string {
  if (key === NAME) return OLD_NAME;
  return key.startsWith(`${NAME}:`) ? `${OLD_NAME}${key.slice(NAME.length)}` : key;
}

/** The new name of an item knobs keeps, old or new, or null for one of the page's. */
export function ownName(key: string): string | null {
  if (key === NAME || key.startsWith(`${NAME}:`)) return key;
  if (key === OLD_NAME) return NAME;
  return key.startsWith(`${OLD_NAME}:`) ? `${NAME}${key.slice(OLD_NAME.length)}` : null;
}

/** Is `key` an item knobs keeps for itself, under either name, and not one of the page's? */
export function isOwnKey(key: string): boolean {
  return ownName(key) !== null;
}

/** Does a storage event's key name the item `key`, under either name? */
export function sameItem(eventKey: string | null, key: string): boolean {
  return eventKey === key || eventKey === oldKey(key);
}

/**
 * The item `key`, read under its old name where it has one. A new item with
 * no old one beside it is not read: an old copy removes the old name only, so
 * that new item is one the old copy removed.
 */
export function readItem(storage: Storage | null | undefined, key: string): string | null {
  if (!storage) return null;
  return storage.getItem(oldKey(key));
}

/** Write the item `key` under both names, the old one first, so a refused second write leaves the truth current. */
export function writeItem(storage: Storage | null | undefined, key: string, value: string): void {
  if (!storage) return;
  const old = oldKey(key);
  storage.setItem(old, value);
  if (old !== key) storage.setItem(key, value);
}

/** Drop the item `key` under both names. */
export function removeItem(storage: Storage | null | undefined, key: string): void {
  if (!storage) return;
  storage.removeItem(key);
  storage.removeItem(oldKey(key));
}

/** The new names of the items that start with `prefix`, a new name, listed where their old name is, as `readItem` reads them. */
export function itemKeys(storage: Storage, prefix: string): string[] {
  const old = oldKey(prefix);
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key === null || !key.startsWith(old)) continue;
    const name = ownName(key) ?? key;
    if (name.startsWith(prefix)) keys.push(name);
  }
  return keys;
}
