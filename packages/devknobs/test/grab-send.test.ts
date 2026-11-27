import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { deliverGrab } from "../src/grab/clipboard";
import { settledText } from "../src/grab/picks";
import { allowedEndpoint, GRAB_EVENT, isGrabSend, sendGrab, setGrabSend } from "../src/grab/send";
import type { GrabPayload } from "../src/grab/types";

const PAYLOAD: GrabPayload = {
  content: "[<button> in Save (at src/Save.tsx:4:2)]",
  entries: [
    {
      tagName: "button",
      componentName: "Save",
      content: "[<button> in Save (at src/Save.tsx:4:2)]",
      selector: "button",
      source: null,
      stackContext: "",
      frames: [],
    },
  ],
  note: "make it blue",
};

const PAGE = "https://review.localhost/pages/one";

const realFetch = globalThis.fetch;
let posts: { url: string; init: RequestInit | undefined }[];
let answer: () => Promise<Response>;
let events: unknown[];

beforeEach(() => {
  posts = [];
  events = [];
  answer = async () => new Response(null, { status: 204 });
  const win = Object.assign(new EventTarget(), { location: { href: PAGE } });
  win.addEventListener(GRAB_EVENT, (event) => {
    if (event instanceof CustomEvent) events.push(event.detail);
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
  globalThis.fetch = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      posts.push({ url: String(url), init });
      return answer();
    },
    { preconnect: realFetch.preconnect },
  );
});

afterEach(() => {
  setGrabSend(undefined);
  globalThis.fetch = realFetch;
  Reflect.deleteProperty(globalThis, "window");
});

describe("allowedEndpoint", () => {
  test("takes the page's own origin, relative paths included", () => {
    expect(allowedEndpoint("/api/grab", PAGE)).toBe("https://review.localhost/api/grab");
    expect(allowedEndpoint("https://shop.example/grab", "https://shop.example/a")).toBe("https://shop.example/grab");
  });

  test("takes http and https on localhost, 127.0.0.1 and .localhost names", () => {
    expect(allowedEndpoint("http://localhost:4000/grab", "https://shop.example/")).toBe("http://localhost:4000/grab");
    expect(allowedEndpoint("http://127.0.0.1:9/grab", "https://shop.example/")).toBe("http://127.0.0.1:9/grab");
    expect(allowedEndpoint("https://review.localhost/grab", "https://shop.example/")).toBe("https://review.localhost/grab");
  });

  test("refuses any other host or scheme", () => {
    expect(allowedEndpoint("https://evil.example/grab", PAGE)).toBeNull();
    expect(allowedEndpoint("https://localhost.evil.example/grab", PAGE)).toBeNull();
    expect(allowedEndpoint("ftp://localhost/grab", PAGE)).toBeNull();
    expect(allowedEndpoint("javascript:alert(1)", PAGE)).toBeNull();
  });

  test("refuses everything on a page with an opaque origin", () => {
    for (const base of ["file:///Users/me/page.html", "about:blank"]) {
      expect(allowedEndpoint("javascript:alert(1)", base)).toBeNull();
      expect(allowedEndpoint("data:text/plain,hi", base)).toBeNull();
      expect(allowedEndpoint("//evil.com/grab", base)).toBeNull();
    }
  });
});

describe("the knobs:grab event", () => {
  test("fires once per grab with the payload, sent or not", async () => {
    const delivery = deliverGrab(PAYLOAD, async () => true);
    expect(events).toEqual([PAYLOAD]);
    expect(await delivery.copied).toBe(true);
    expect(await delivery.sent).toBeNull();
    deliverGrab(PAYLOAD, async () => false);
    expect(events).toEqual([PAYLOAD, PAYLOAD]);
  });
});

describe("a send target", () => {
  test("a function that never settles counts as failed after the timeout", async () => {
    setGrabSend(() => new Promise<void>(() => undefined));
    expect(await sendGrab(PAYLOAD, 5)).toBe(false);
  });

  test("a URL gets the payload POSTed as json", async () => {
    setGrabSend("/api/grab");
    expect(await sendGrab(PAYLOAD)).toBe(true);
    expect(posts).toHaveLength(1);
    const post = posts[0];
    expect(post?.url).toBe("https://review.localhost/api/grab");
    expect(post?.init?.method).toBe("POST");
    expect(post?.init?.credentials).toBe("same-origin");
    expect(post?.init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(post?.init?.body))).toEqual({ type: "knobs.grab", payload: PAYLOAD });
  });

  test("a URL off the page's origin and off localhost is refused with one warning", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      setGrabSend("https://evil.example/grab");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(await sendGrab(PAYLOAD)).toBeNull();
      expect(posts).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });

  test("a function gets the payload", async () => {
    const got: GrabPayload[] = [];
    setGrabSend((payload) => {
      got.push(payload);
    });
    expect(await sendGrab(PAYLOAD)).toBe(true);
    expect(got).toEqual([PAYLOAD]);
  });

  test("a target that fails does not stop the copy", async () => {
    let copies = 0;
    const copy = async () => {
      copies++;
      return true;
    };
    setGrabSend(async () => {
      throw new Error("down");
    });
    const thrown = deliverGrab(PAYLOAD, copy);
    expect(await thrown.copied).toBe(true);
    expect(await thrown.sent).toBe(false);

    setGrabSend("/api/grab");
    answer = async () => {
      throw new TypeError("network");
    };
    const offline = deliverGrab(PAYLOAD, copy);
    expect(await offline.copied).toBe(true);
    expect(await offline.sent).toBe(false);

    answer = async () => new Response(null, { status: 500 });
    expect(await deliverGrab(PAYLOAD, copy).sent).toBe(false);
    expect(copies).toBe(3);
    expect(events).toHaveLength(3);
  });

  test("only strings and functions are targets", () => {
    expect(isGrabSend("/grab")).toBe(true);
    expect(isGrabSend(() => undefined)).toBe(true);
    expect(isGrabSend(42)).toBe(false);
    expect(isGrabSend(null)).toBe(false);
  });
});

describe("settledText", () => {
  test("a copy with no target keeps the first toast", () => {
    expect(settledText(1, true, null)).toBeNull();
    expect(settledText(1, false, null)).toEqual({ text: "Copy failed", good: false });
  });

  test("a send that went says Sent beside the copy", () => {
    expect(settledText(1, true, true)).toEqual({ text: "Copied · Sent", good: true });
    expect(settledText(3, true, true)).toEqual({ text: "Copied 3 · Sent", good: true });
    expect(settledText(1, false, true)).toEqual({ text: "Sent", good: true });
  });

  test("a send that failed says so", () => {
    expect(settledText(1, true, false)).toEqual({ text: "Send failed", good: false });
    expect(settledText(1, false, false)).toEqual({ text: "Copy and send failed", good: false });
  });
});
