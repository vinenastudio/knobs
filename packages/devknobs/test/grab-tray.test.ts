import { describe, expect, test } from "bun:test";
import { TRAY_CSS } from "../src/grab/tray";

describe("TRAY_CSS", () => {
  test("keeps the tray fixed, bounded and still with reduced motion", () => {
    expect(TRAY_CSS).toContain("position: fixed;");
    expect(TRAY_CSS).toContain("max-height: 40vh;");
    expect(TRAY_CSS).toContain("width: min(380px, calc(100vw - 32px));");
    expect(TRAY_CSS).toContain("env(safe-area-inset-bottom");
    expect(TRAY_CSS).toContain("prefers-reduced-motion: reduce");
  });

  test("goes light by the page's theme, not by the label's", () => {
    expect(TRAY_CSS).toContain('.tray[data-page="light"]');
    expect(TRAY_CSS).not.toContain("data-bar");
  });

  test("keeps the list's column to the tray's width, so a long label never pushes a row's start out", () => {
    expect(TRAY_CSS).toContain("grid-template-columns: minmax(0, 1fr);");
  });
});
