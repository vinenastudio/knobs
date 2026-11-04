import { describe, expect, test } from "bun:test";
import { riskyAttribute, riskyEdit, riskyElement, riskyNodes, scriptUrl } from "../src/edit/risk";
import { as, elem, page, svg, text } from "./dom-page";

describe("what could run a script", () => {
  test("in parsed markup: the elements that run or load one, and handlers, srcdoc and javascript: addresses anywhere in it", () => {
    page(() => []);
    for (const tag of ["script", "iframe", "frame", "object", "embed", "base", "meta", "link"]) {
      expect(riskyNodes([as(elem("div", {}, elem("p", {}, elem(tag))))])).toBe(true);
    }
    expect(riskyNodes([as(elem("img", { src: "data:,", onerror: "x()" }))])).toBe(true);
    expect(riskyNodes([as(elem("div", {}, elem("b", { OnClick: "x()" })))])).toBe(true);
    for (const name of ["href", "src", "action", "formaction", "xlink:href"]) {
      expect(riskyNodes([as(elem("a", { [name]: "  JAVASCRIPT:alert(1)" }))])).toBe(true);
    }
    expect(riskyNodes([as(svg("svg", {}, svg("set", { attributeName: "href", to: "javascript:x" })))])).toBe(true);
    expect(riskyNodes([as(elem("div", { srcdoc: "<p>" }))])).toBe(true);
    expect(riskyNodes([as(elem("a", { href: "/shop", class: "cta" }, text("Buy"))), as(text("<script>"))])).toBe(false);
  });

  test("in an attribute: on…, srcdoc, and javascript: in an address, as the browser reads it", () => {
    expect(riskyAttribute("onclick", "x")).toBe(true);
    expect(riskyAttribute(" ONLOAD ", null)).toBe(true);
    expect(riskyAttribute("srcdoc", "")).toBe(true);
    expect(riskyAttribute("href", "java\tscript:alert(1)")).toBe(true);
    expect(riskyAttribute("title", "javascript:x")).toBe(false);
    expect(riskyAttribute("href", "/javascript:x")).toBe(false);
    expect(scriptUrl("\u0001 javascript:")).toBe(true);
    expect(riskyAttribute("values", "x;javascript:alert(1)")).toBe(true);
    expect(riskyAttribute("values", "; JavaScript:alert(1)")).toBe(true);
    expect(riskyAttribute("by", "javascript:x")).toBe(true);
    expect(riskyAttribute("values", "0;1;0")).toBe(false);
  });

  test("on the page's own elements that run or load a script, in any namespace", () => {
    page(() => []);
    for (const tag of ["script", "base", "iframe", "object", "embed", "link", "meta"]) expect(riskyElement(as(elem(tag)) as Element)).toBe(true);
    expect(riskyElement(as(svg("script")) as Element)).toBe(true);
    expect(riskyElement(as(elem("div")) as Element)).toBe(false);
  });

  test("from text alone, erring to refuse", () => {
    const html = (after: string) => riskyEdit({ kind: "html", property: "html", after });
    expect(html("<p>Buy <b>now</b></p>")).toBe(false);
    expect(html("<SCRIPT>x</SCRIPT>")).toBe(true);
    expect(html('<img src=x onerror="y">')).toBe(true);
    expect(html('<a href="jav&#x61;script:x">')).toBe(true);
    expect(html('<a href="java script:x">')).toBe(true);
    expect(html("<iframe srcdoc=x>")).toBe(true);
    expect(riskyEdit({ kind: "attr", property: "onerror", after: "x" })).toBe(true);
    expect(riskyEdit({ kind: "text", property: "text", after: "<script>" })).toBe(false);
  });
});
