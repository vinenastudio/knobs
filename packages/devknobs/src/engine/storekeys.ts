/**
 * The names of the items knobs keeps in web storage. Each is `knobs` or
 * `knobs:<name>`, and was `devknobs` or `devknobs:<name>` before the rename.
 * An old npm copy and a new extension copy can share one origin, so for now
 * a read takes the new item first and the old one where the new is absent,
 * a write puts both, and a remove drops both.
 *
 * Writing the old items goes away two minor releases after 0.8: from then on
 * only the new item is written, and a read that finds only the old one moves
 * it over and deletes it.
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

/** The item `key`, the new one first, then the old one. */
export function readItem(storage: Storage | null | undefined, key: string): string | null {
  if (!storage) return null;
  return storage.getItem(key) ?? storage.getItem(oldKey(key));
}

/** Write the item `key` under both names. */
export function writeItem(storage: Storage | null | undefined, key: string, value: string): void {
  if (!storage) return;
  storage.setItem(key, value);
  const old = oldKey(key);
  if (old !== key) storage.setItem(old, value);
}

/** Drop the item `key` under both names. */
export function removeItem(storage: Storage | null | undefined, key: string): void {
  if (!storage) return;
  storage.removeItem(key);
  storage.removeItem(oldKey(key));
}

/** The new names of the items that start with `prefix`, a new name, under either name, each once. */
export function itemKeys(storage: Storage, prefix: string): string[] {
  const keys = new Set<string>();
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    const name = key === null ? null : ownName(key);
    if (name?.startsWith(prefix)) keys.add(name);
  }
  return [...keys];
}
