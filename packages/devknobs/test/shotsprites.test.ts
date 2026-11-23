import { describe, expect, test } from "bun:test";
import { prefixIds, prefixRefs } from "../src/engine/shotsprites";

/** An element of a sprite file: its attributes, and those under it. */
class Part {
  readonly attributes: { localName: string; name: string; namespaceURI: string | null; value: string }[];
  constructor(
    attributes: Record<string, string>,
    readonly children: Part[] = [],
  ) {
    this.attributes = Object.entries(attributes).map(([name, value]) => ({ localName: name.replace(/^xlink:/, ""), name, namespaceURI: name.startsWith("xlink:") ? "http://www.w3.org/1999/xlink" : null, value }));
  }
  querySelectorAll(): Part[] {
    return this.children.flatMap((child) => [child, ...child.querySelectorAll()]);
  }
  setAttributeNS(namespace: string | null, name: string, value: string): void {
    const found = this.attributes.find((attribute) => attribute.name === name && attribute.namespaceURI === namespace);
    if (found) found.value = value;
  }
  get(name: string): string | undefined {
    return this.attributes.find((attribute) => attribute.name === name)?.value;
  }
}

describe("prefixRefs", () => {
  test("makes each url() to an id the prefixed id's", () => {
    expect(prefixRefs("url(#g)", "p-")).toBe("url(#p-g)");
    expect(prefixRefs("fill: url('#g'); stroke: url(\"#h\")", "p-")).toBe("fill: url('#p-g'); stroke: url(\"#p-h\")");
  });

  test("leaves a value with no url() to an id as it is, a color in hex too", () => {
    for (const value of ["red", "#fff", "url(/a.svg#b)", "0 0 40 40", ""]) expect(prefixRefs(value, "p-")).toBe(value);
  });
});

describe("prefixIds", () => {
  test("prefixes each id of a sprite file and each reference to one, so none meets an id of the page", () => {
    const circle = new Part({ fill: "url(#g)", stroke: "#fff", "xlink:href": "#base" });
    const symbol = new Part({ id: "dot", viewBox: "0 0 40 40" }, [circle]);
    const gradient = new Part({ id: "g" });
    const root = new Part({ xmlns: "http://www.w3.org/2000/svg" }, [symbol, gradient]);
    prefixIds(root as unknown as Element, "knobs-sprite-0-");
    expect(symbol.get("id")).toBe("knobs-sprite-0-dot");
    expect(gradient.get("id")).toBe("knobs-sprite-0-g");
    expect(circle.get("fill")).toBe("url(#knobs-sprite-0-g)");
    expect(circle.get("xlink:href")).toBe("#knobs-sprite-0-base");
    expect(circle.get("stroke")).toBe("#fff");
    expect(symbol.get("viewBox")).toBe("0 0 40 40");
  });
});
