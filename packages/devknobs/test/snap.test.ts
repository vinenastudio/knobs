import { describe, expect, test } from "bun:test";
import { bezelMock } from "../src/engine/bezels";
import { fit, snapScale, snapShift, STRIP } from "../src/engine/fit";

const RATIOS = [1, 1.25, 1.5, 2, 2.5, 3];

/** Is `value` a whole number, give or take float noise? */
function whole(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-6;
}

describe("snapScale", () => {
  test("makes the length a whole number of device pixels, at most one smaller", () => {
    for (const ratio of RATIOS) {
      for (const scale of [0.4, 0.5137, 0.84, 1.3]) {
        const snapped = snapScale(scale, 874, ratio);
        expect(whole(874 * snapped * ratio)).toBe(true);
        expect(snapped).toBeLessThanOrEqual(scale);
        expect(874 * (scale - snapped) * ratio).toBeLessThan(1);
      }
    }
  });

  test("leaves a scale of 1, an empty fit and an unknown ratio alone", () => {
    expect(snapScale(1, 874, 1.25)).toBe(1);
    expect(snapScale(0, 874, 2)).toBe(0);
    expect(snapScale(0.84, 0, 2)).toBe(0.84);
    expect(snapScale(0.84, 874, 0)).toBe(0.84);
  });
});

describe("snapShift", () => {
  test("moves an edge onto a whole device pixel, by half of one at most", () => {
    for (const ratio of RATIOS) {
      for (const at of [0, 12.3, 101.41, 333.333, 640.9]) {
        const shift = snapShift(at, ratio);
        expect(whole((at + shift) * ratio)).toBe(true);
        expect(Math.abs(shift * ratio)).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  test("leaves an edge alone at an unknown ratio", () => {
    expect(snapShift(12.3, 0)).toBe(0);
  });
});

describe("fit with a ratio", () => {
  const mock = bezelMock("iphone-18-pro", "portrait");
  if (!mock) throw new Error("no iPhone 18 Pro mock");
  const phone = { width: 402, height: 874, zoom: "fit" } as const;

  test("draws a device's screen a whole number of device pixels tall", () => {
    for (const ratio of RATIOS) {
      for (const size of [{ width: 1512, height: 838 }, { width: 1280, height: 720 }]) {
        const loose = fit(phone, size, { mock: mock.inset });
        const place = fit(phone, size, { mock: mock.inset, ratio });
        expect(whole(place.height * place.scale * ratio)).toBe(true);
        expect(place.scale).toBeLessThanOrEqual(loose.scale);
        expect(place.height * (loose.scale - place.scale) * ratio).toBeLessThan(1);
        expect(place.box.height).toBeLessThanOrEqual(size.height - STRIP);
      }
    }
  });

  test("leaves a frame with no mock as it was", () => {
    const size = { width: 1280, height: 720 };
    expect(fit(phone, size, { ratio: 1.25 })).toEqual(fit(phone, size));
  });
});
