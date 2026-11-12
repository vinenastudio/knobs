/** How long a wait for the knobs to settle lasts at most, in ms. */
export const READY_WAIT = 10000;

/**
 * `value` once `settled` says so, checked every animation frame. Past `wait`
 * ms it rejects, on a timer, as a hidden tab runs no frames. A page on its way
 * out never settles. With nothing `mounted`, at the call or at a later check,
 * it rejects with `devknobs: not mounted`.
 */
export function whenSettled<T>(
  settled: () => boolean,
  leaving: () => boolean,
  value: () => T,
  mounted: () => boolean,
  wait = READY_WAIT,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const notMounted = () => new Error("knobs: not mounted");
    if (!mounted()) {
      reject(notMounted());
      return;
    }
    let frame = 0;
    const stop = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
    const check = () => {
      if (leaving()) return stop();
      if (!mounted()) {
        stop();
        reject(notMounted());
        return;
      }
      if (!settled()) {
        frame = window.requestAnimationFrame(check);
        return;
      }
      stop();
      resolve(value());
    };
    const timer = window.setTimeout(() => {
      stop();
      if (leaving()) return;
      if (!mounted()) reject(notMounted());
      else if (settled()) resolve(value());
      else reject(new Error("knobs: not settled after 10 seconds"));
    }, wait);
    frame = window.requestAnimationFrame(check);
  });
}
