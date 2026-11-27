import { deliverGrab } from "./clipboard";
import { grabContext } from "./context";
import { isElement } from "./inspect";
import type { GrabOptions, GrabResult } from "./types";

export { startMode } from "./mode";
export { createOutline } from "./outline";

function iterable(value: unknown): value is Iterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, Symbol.iterator) === "function"
  );
}

function listOf(elements: unknown): unknown[] {
  if (isElement(elements)) return [elements];
  return iterable(elements) ? Array.from(elements) : [];
}

/**
 * Build the context of an element, an array or a NodeList of them and copy
 * it. Entries that are not elements, such as a `querySelector` that found
 * nothing, are skipped. Null when the elements gave nothing.
 */
export async function grab(
  elements?: Element | Iterable<Element | null | undefined> | null,
  options: GrabOptions = {},
): Promise<GrabResult | null> {
  const found = listOf(elements).filter(isElement);
  if (found.length === 0) return null;
  const payload = await grabContext(found, options);
  if (!payload.content.trim()) return null;
  return { ...payload, copied: await deliverGrab(payload).copied };
}
