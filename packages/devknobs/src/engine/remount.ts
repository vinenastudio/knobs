/**
 * Puts devknobs' own nodes back where a page's scripts take them out, such as
 * a React root on `<body>` that clears it as it renders, or an app that
 * replaces `<body>`.
 */

/** Removals put back at once within `BURST_SPAN`, before each waits longer. */
export const BURST = 10;
/** In ms. */
export const BURST_SPAN = 1000;
/** The longest a put back waits once the page keeps taking the node out, in ms. */
export const LONGEST_WAIT = 8000;
/** A page quiet this long, in ms, has its node put back at once again: longer than any wait. */
export const CALM = LONGEST_WAIT * 2;

/** How long to wait before putting a node back: 0 at once, longer each time while a page keeps at it. */
export interface Guard {
  next(now: number): number;
}

export function createGuard(): Guard {
  let times: number[] = [];
  let wait = 0;
  let last = -Infinity;
  return {
    next(now: number): number {
      if (now - last >= CALM) {
        times = [];
        wait = 0;
      }
      last = now;
      times = times.filter((time) => now - time < BURST_SPAN);
      times.push(now);
      if (wait === 0 && times.length <= BURST) return 0;
      wait = Math.min(wait === 0 ? BURST_SPAN : wait * 2, LONGEST_WAIT);
      return wait;
    },
  };
}

export interface KeepOptions {
  /** Where the node goes back: `<body>`, or `<html>` before there is one. */
  home?: () => Node;
  /** Runs after each put back. */
  restored?: () => void;
}

/**
 * Keep `node` in the page until the returned stop: taken out by the page, or
 * left in a `<body>` the page replaced, it goes back at once, then less often
 * while the page keeps at it. Stop before taking it out on purpose.
 */
export function keepMounted(node: Element, options: KeepOptions = {}): () => void {
  const home = options.home ?? (() => document.body ?? document.documentElement);
  const guard = createGuard();
  let stopped = false;
  let timer = 0;
  let warned = false;
  const observer = new MutationObserver(check);

  function watch(): void {
    observer.disconnect();
    observer.observe(document, { childList: true });
    observer.observe(document.documentElement, { childList: true });
    const parent = node.parentNode;
    if (parent && parent !== document.documentElement && parent !== document) {
      observer.observe(parent, { childList: true });
    }
  }

  function restore(): void {
    timer = 0;
    if (stopped || node.isConnected) return;
    home().appendChild(node);
    watch();
    options.restored?.();
  }

  function check(): void {
    if (stopped || timer) return;
    if (node.isConnected) {
      // Moved on purpose, such as into a `<body>` that came later: follow it there.
      watch();
      return;
    }
    const wait = guard.next(performance.now());
    if (wait === 0) {
      restore();
      return;
    }
    if (!warned) {
      warned = true;
      console.warn("knobs: the page keeps removing knobs' elements; putting them back less often");
    }
    timer = window.setTimeout(restore, wait);
  }

  watch();
  return () => {
    stopped = true;
    clearTimeout(timer);
    timer = 0;
    observer.disconnect();
  };
}
