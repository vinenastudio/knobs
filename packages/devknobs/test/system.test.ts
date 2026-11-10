import { describe, expect, test } from "bun:test";
import { setSystemMedia, systemMedia, watchSystemMedia } from "../src/engine/system";
import { ownCss } from "../src/ui/panel";
import { CSS } from "../src/ui/styles";

describe("the user's own media, from a host", () => {
  test("is told to each watcher, now and on each change, until it stops", () => {
    const heard: unknown[] = [];
    const stop = watchSystemMedia((media) => heard.push(media));
    setSystemMedia({ scheme: "dark", motion: "reduce" });
    stop();
    setSystemMedia(null);
    expect(heard).toEqual([null, { scheme: "dark", motion: "reduce" }]);
    expect(systemMedia()).toBeNull();
  });

  test("settles the panel's prefers queries, and leaves its other ones", () => {
    const light = ownCss({ scheme: "light", motion: "no-preference" });
    expect(light).not.toContain("prefers-");
    expect(light).toContain("@media (not (min-width: 0px)) {");
    expect(light).not.toContain("color-scheme: light dark");
    expect(light).toContain("color-scheme: light;");
    const dark = ownCss({ scheme: "dark", motion: "reduce" });
    expect(dark).not.toContain("@media (not (min-width: 0px))");
    expect(dark).toContain("color-scheme: dark;");
    const others = (css: string) =>
      [...css.matchAll(/@media (?!\(not \(min-width: 0px\)\)|\(min-width: 0px\))[^{]+/g)].map(([query]) => query);
    expect(others(dark)).toEqual(others(CSS).filter((query) => !query.includes("prefers-")));
  });
});
