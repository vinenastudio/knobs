import { useEffect } from 'react';
import { track } from './analytics.ts';

type Knobs = typeof import('@vinena/knobs');

let loading: Promise<Knobs> | undefined;
let mounted = false;

/**
 * devknobs is most of the page's JavaScript, so it loads after hydration
 * instead of in the entry chunk. One load for the whole page, and the panel
 * mounts once. Each call queues on the same promise, so mounts and unmounts
 * run in the order they were asked for.
 */
export function mountKnobs(): Promise<Knobs> {
  loading ??= import('@vinena/knobs').catch((error: unknown) => {
    // A failed load is not kept, so the next mount tries again.
    loading = undefined;
    throw error;
  });
  return loading.then((module) => {
    if (!mounted) {
      module.mount();
      mounted = true;
    }
    return module;
  });
}

export function unmountKnobs(): void {
  void loading?.then((module) => {
    if (mounted) {
      module.unmount();
      mounted = false;
    }
  });
}

/** True once a visitor has turned a knob in this tab, so the stored state should apply at once. */
function hasStoredKnobs(): boolean {
  try {
    return sessionStorage.getItem('devknobs') !== null;
  } catch {
    return false;
  }
}

/**
 * Runs `task` when the browser is idle, at most a second after it is asked.
 * Safari has no `requestIdleCallback`, so a short timer stands in.
 */
function whenIdle(task: () => void): () => void {
  if ('requestIdleCallback' in window) {
    const id = requestIdleCallback(task, { timeout: 1000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 200);
  return () => clearTimeout(id);
}

// The devknobs host element. Its shadow root is open, so a click inside the
// panel still reaches `document` with the real button in its composed path.
const PANEL = '[data-knobs="panel"],[data-devknobs="panel"]';

/**
 * A composed path is a list of `EventTarget`s: the shadow root, `document` and
 * `window` ride along with the elements. Only the elements answer `matches` and
 * `closest`, and only they carry a node type of their own.
 */
export function asElement(node: EventTarget | undefined): Element | null {
  const element = node as Element | null | undefined;
  return element?.nodeType === Node.ELEMENT_NODE ? element : null;
}

/**
 * Every click on the page, read and reported: the links, and which knob of
 * the panel a visitor actually turns. It only observes. No `preventDefault`,
 * no `stopPropagation`, so the click behaves as it always did.
 */
function trackClick(event: MouseEvent) {
  const path = event.composedPath();
  const target = asElement(path[0]);
  if (target === null) {
    return;
  }
  if (path.some((node) => asElement(node)?.matches(PANEL) === true)) {
    // Buttons, and the search results, which are options rather than buttons.
    // The fields are inputs, and a click on the panel's own chrome hits nothing.
    const control = target.closest('button, [role="option"]');
    if (control === null) {
      return;
    }
    // A row and a result carry their value in a span of its own; the handle,
    // `×` and the switches carry it as text or an aria-label.
    const text = (control.querySelector('.row-label, .entry-value') ?? control).textContent?.trim();
    track('knob_click', {
      control:
        (text === undefined || text === '' ? control.getAttribute('aria-label') : text) ??
        undefined,
      // The knob inside an open row's editor, or the knob a search result sets.
      group: (
        control.closest('.knob')?.querySelector('.knob-label') ??
        control.querySelector('.entry-knob, .entry-name')
      )?.textContent?.trim(),
    });
    return;
  }
  const link = target.closest('a');
  if (link === null) {
    return;
  }
  track('link_click', {
    href: link.href,
    label: link.textContent?.trim() || (link.getAttribute('aria-label') ?? undefined),
  });
}

/**
 * A guided tour riding on the panel: `open` runs before the panel mounts, so
 * the copy of the page in a device's frame finds the tour on the page above,
 * and returns the way to close it; `watch` gets devknobs once it is mounted.
 * Pass a value that stays the same across renders.
 */
export type PanelTour = {
  open: () => () => void;
  watch: (knobs: Knobs) => void;
};

/**
 * The panel is the demo, so it runs on the site's pages in every environment,
 * not gated on dev the way an app embedding devknobs would gate it.
 * Client-only: `mount` touches `document`, and SSR must never reach it. It
 * starts collapsed to its edge tab, and stays open across the reloads the
 * device and locale knobs cause once a visitor opens it. A first visit loads
 * it when the browser is idle; a reload with knobs already set loads it at
 * once, so the stored scheme or language does not wait.
 */
export function usePanel(tour?: PanelTour): void {
  useEffect(() => {
    const closeTour = tour?.open();
    const start = () => void mountKnobs().then(tour?.watch);
    let cancel: (() => void) | undefined;
    if (hasStoredKnobs()) {
      start();
    } else {
      cancel = whenIdle(start);
    }
    // One delegated listener for the whole page, panel included. Passive: it
    // never cancels the click it is reading.
    document.addEventListener('click', trackClick, { passive: true });
    return () => {
      cancel?.();
      document.removeEventListener('click', trackClick);
      closeTour?.();
      unmountKnobs();
    };
  }, [tour]);
}
