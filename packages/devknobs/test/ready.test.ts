import { afterEach, describe, expect, test } from "bun:test";
import { whenSettled } from "../src/engine/ready";

/** A window whose animation frames and timers run when the test says so. */
function frames(): { step: () => void; expire: () => void; pending: () => number } {
  const queue = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  let ids = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      requestAnimationFrame: (callback: () => void) => {
        queue.set(++ids, callback);
        return ids;
      },
      cancelAnimationFrame: (id: number) => {
        queue.delete(id);
      },
      setTimeout: (callback: () => void) => {
        timers.set(++ids, callback);
        return ids;
      },
      clearTimeout: (id: number) => {
        timers.delete(id);
      },
    },
  });
  const run = (map: Map<number, () => void>) => {
    const due = Array.from(map.values());
    map.clear();
    for (const callback of due) callback();
  };
  return {
    step: () => run(queue),
    expire: () => run(timers),
    pending: () => queue.size + timers.size,
  };
}

/** How a promise has settled, once the microtasks ran. */
async function outcome(promise: Promise<unknown>): Promise<"pending" | "resolved" | "rejected"> {
  let state: "pending" | "resolved" | "rejected" = "pending";
  void promise.then(
    () => {
      state = "resolved";
    },
    () => {
      state = "rejected";
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  return state;
}

describe("whenSettled", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("resolves on the next frame when nothing is pending", async () => {
    const clock = frames();
    const waiting = whenSettled(
      () => true,
      () => false,
      () => "state",
      () => true,
    );
    expect(await outcome(waiting)).toBe("pending");
    clock.step();
    expect(await waiting).toBe("state");
    expect(clock.pending()).toBe(0);
  });

  test("waits for the frame to settle", async () => {
    const clock = frames();
    let settled = false;
    const waiting = whenSettled(
      () => settled,
      () => false,
      () => "state",
      () => true,
    );
    clock.step();
    clock.step();
    expect(await outcome(waiting)).toBe("pending");
    settled = true;
    clock.step();
    expect(await waiting).toBe("state");
    expect(clock.pending()).toBe(0);
  });

  test("rejects once the wait is over", async () => {
    const clock = frames();
    const waiting = whenSettled(
      () => false,
      () => false,
      () => "state",
      () => true,
    );
    clock.step();
    clock.expire();
    await expect(waiting).rejects.toThrow("knobs: not settled after 10 seconds");
    expect(clock.pending()).toBe(0);
  });

  test("gives up in a hidden tab, which runs no frames", async () => {
    const clock = frames();
    const waiting = whenSettled(
      () => false,
      () => false,
      () => "state",
      () => true,
    );
    clock.expire();
    expect(await outcome(waiting)).toBe("rejected");
    expect(clock.pending()).toBe(0);
  });

  test("resolves at the wait's end when it settled without a frame", async () => {
    const clock = frames();
    const waiting = whenSettled(
      () => true,
      () => false,
      () => "state",
      () => true,
    );
    clock.expire();
    expect(await waiting).toBe("state");
    expect(clock.pending()).toBe(0);
  });

  test("never settles on a page on its way out", async () => {
    const clock = frames();
    const waiting = whenSettled(
      () => true,
      () => true,
      () => "state",
      () => true,
    );
    clock.step();
    clock.expire();
    expect(await outcome(waiting)).toBe("pending");
    expect(clock.pending()).toBe(0);
  });

  test("never rejects on a page that leaves before the wait is over", async () => {
    const clock = frames();
    const waiting = whenSettled(
      () => false,
      () => true,
      () => "state",
      () => true,
    );
    clock.expire();
    expect(await outcome(waiting)).toBe("pending");
  });

  test("rejects right away when nothing is mounted", async () => {
    const clock = frames();
    const waiting = whenSettled(
      () => true,
      () => false,
      () => "state",
      () => false,
    );
    await expect(waiting).rejects.toThrow("knobs: not mounted");
    expect(clock.pending()).toBe(0);
  });

  test("rejects when devknobs unmounts during the wait", async () => {
    const clock = frames();
    let mounted = true;
    const waiting = whenSettled(
      () => false,
      () => false,
      () => "state",
      () => mounted,
    );
    clock.step();
    expect(await outcome(waiting)).toBe("pending");
    mounted = false;
    clock.step();
    await expect(waiting).rejects.toThrow("knobs: not mounted");
    expect(clock.pending()).toBe(0);
  });

  test("says not mounted in a hidden tab too, once the wait is over", async () => {
    const clock = frames();
    let mounted = true;
    const waiting = whenSettled(
      () => false,
      () => false,
      () => "state",
      () => mounted,
    );
    mounted = false;
    clock.expire();
    await expect(waiting).rejects.toThrow("knobs: not mounted");
  });
});
