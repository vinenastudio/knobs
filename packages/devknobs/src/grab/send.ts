import type { GrabPayload } from "./types";

/** Where each grab goes besides the clipboard: an endpoint to POST it to, or a function. */
export type GrabSend = string | ((payload: GrabPayload) => void | Promise<void>);

/** The event every grab dispatches on `window`, with the payload as its detail. */
export const GRAB_EVENT = "knobs:grab";

/** Is it a send target, read from another copy's options? */
export function isGrabSend(value: unknown): value is GrabSend {
  return typeof value === "string" || typeof value === "function";
}

let target: GrabSend | null = null;

const LOCAL = /^(localhost|127\.0\.0\.1|.+\.localhost)$/;

/**
 * The endpoint as an absolute URL where grab may send to it: the page's own
 * origin, or http(s) on localhost, 127.0.0.1 or a `.localhost` name. Null otherwise.
 */
export function allowedEndpoint(url: string, base: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return null;
  }
  if (parsed.origin === "null" || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return null;
  if (parsed.origin === new URL(base).origin) return parsed.href;
  if (LOCAL.test(parsed.hostname)) return parsed.href;
  return null;
}

/** Set where grabs are sent, or with undefined send them nowhere. An endpoint grab may not send to is ignored. */
export function setGrabSend(send: GrabSend | undefined): void {
  if (typeof send === "function") {
    target = send;
    return;
  }
  if (typeof send !== "string") {
    target = null;
    return;
  }
  target = allowedEndpoint(send, window.location.href);
  if (!target) console.warn(`knobs: grab sends only to this page's origin or to localhost, not to ${send}`);
}

/** Tell the page about a grab. Listeners that throw do not reach grab. */
export function announceGrab(payload: GrabPayload): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(GRAB_EVENT, { detail: payload }));
  } catch {
    // The page's trouble, not grab's.
  }
}

/** How long a send may take before it counts as failed, in ms. */
export const SEND_TIMEOUT = 10000;

/** Send a grab to the target: true where it went, false where it failed or timed out, null with no target. */
export async function sendGrab(payload: GrabPayload, timeout = SEND_TIMEOUT): Promise<boolean | null> {
  const send = target;
  if (send === null) return null;
  try {
    if (typeof send === "function") {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeout);
      });
      try {
        return await Promise.race([Promise.resolve(send(payload)).then(() => true), late]);
      } finally {
        clearTimeout(timer);
      }
    }
    const response = await fetch(send, {
      method: "POST",
      credentials: "same-origin",
      signal: AbortSignal.timeout(timeout),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "knobs.grab", payload }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
