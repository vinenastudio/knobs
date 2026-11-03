/**
 * A small page for the forced states and new rules: elements that keep their
 * attributes and match selectors as a browser does, for the part of the
 * syntax the tests use (types, classes, attributes, the states, `:is()`,
 * `:not()`, `:where()`, the descendant and child combinators), and throw on
 * any other, and stylesheets that take rules one at a time and refuse what
 * does not parse, as `insertRule` does.
 */

import { splitList } from "../src/styles/selector";
import { Block } from "./edit-block";

/** Past the bracket that opens at `at`, round or square, strings and all. */
function closeOf(text: string, at: number): number {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") i++;
    else if (char === '"' || char === "'") {
      const end = text.indexOf(char, i + 1);
      if (end < 0) throw new SyntaxError("an open string");
      i = end;
    } else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new SyntaxError("an open bracket");
}

/** A complex selector as its compounds, right to left, with the combinator before each. */
function compounds(selector: string): { compound: string; combinator: " " | ">" }[] {
  const parts: { compound: string; combinator: " " | ">" }[] = [];
  let current = "";
  let combinator: " " | ">" = " ";
  let i = 0;
  const flush = (next: " " | ">") => {
    if (current !== "") parts.push({ compound: current, combinator });
    else if (next === ">" && parts.length === 0) throw new SyntaxError("a combinator first");
    current = "";
    combinator = next;
  };
  while (i < selector.length) {
    const char = selector[i] ?? "";
    if (char === "(" || char === "[") {
      const end = closeOf(selector, i);
      current += selector.slice(i, end + 1);
      i = end + 1;
    } else if (char === ">") {
      flush(">");
      i++;
    } else if (/\s/.test(char)) {
      if (current !== "") flush(" ");
      i++;
    } else {
      current += char;
      i++;
    }
  }
  if (current === "") throw new SyntaxError("a selector that ends with a combinator");
  parts.push({ compound: current, combinator });
  return parts.reverse();
}

const STATES = new Set(["hover", "focus", "focus-visible", "active", "focus-within", "visited"]);

/** What matching reads of an element. */
export interface Matchable {
  tagName: string;
  parentElement: Matchable | null;
  getAttribute(name: string): string | null;
  /** The states it has for real. None where left out. */
  states?: Set<string>;
}

function matchesCompound(element: Matchable, compound: string): boolean {
  let i = 0;
  let ok = true;
  const ident = (from: number): string => /^[\w-]+/.exec(compound.slice(from))?.[0] ?? "";
  while (i < compound.length) {
    const char = compound[i];
    if (char === "*") {
      i++;
    } else if (char === ".") {
      const name = ident(i + 1);
      if (!name) throw new SyntaxError(`no class in ${compound}`);
      ok &&= (element.getAttribute("class") ?? "").split(/\s+/).includes(name);
      i += 1 + name.length;
    } else if (char === "#") {
      const name = ident(i + 1);
      ok &&= element.getAttribute("id") === name;
      i += 1 + name.length;
    } else if (char === "[") {
      const end = closeOf(compound, i);
      const found = /^\[([\w-]+)(?:(~?=)"([^"]*)")?\]$/.exec(compound.slice(i, end + 1));
      if (!found) throw new SyntaxError(`an attribute selector it does not read: ${compound}`);
      const [, name = "", op, value = ""] = found;
      const has = element.getAttribute(name);
      if (has === null) ok = false;
      else if (op === "=") ok &&= has === value;
      else if (op === "~=") ok &&= has.split(/\s+/).includes(value);
      i = end + 1;
    } else if (char === ":") {
      if (compound[i + 1] === ":") throw new SyntaxError("a pseudo-element in matches()");
      const name = ident(i + 1).toLowerCase();
      let end = i + 1 + name.length;
      if (compound[end] === "(") {
        const close = closeOf(compound, end);
        const args = compound.slice(end + 1, close);
        const any = splitList(args).some((one) => matchesSelector(element, one));
        if (name === "is" || name === "where") ok &&= any;
        else if (name === "not") ok &&= !any;
        else throw new SyntaxError(`:${name}() is not read here`);
        end = close + 1;
      } else if (STATES.has(name)) {
        ok &&= element.states?.has(name) === true;
      } else {
        throw new SyntaxError(`:${name} is not read here`);
      }
      i = end;
    } else if (/[a-z]/i.test(char ?? "")) {
      const name = ident(i);
      ok &&= element.tagName === name.toUpperCase();
      i += name.length;
    } else {
      throw new SyntaxError(`'${compound}' is not a valid selector`);
    }
  }
  return ok;
}

function matchesComplex(element: Matchable, selector: string): boolean {
  const [subject, ...rest] = compounds(selector.trim());
  if (!subject || !matchesCompound(element, subject.compound)) return false;
  let at: Matchable | null = element;
  let combinator = subject.combinator;
  for (const part of rest) {
    if (combinator === ">") {
      at = at?.parentElement ?? null;
      if (!at || !matchesCompound(at, part.compound)) return false;
    } else {
      at = at?.parentElement ?? null;
      while (at && !matchesCompound(at, part.compound)) at = at.parentElement;
      if (!at) return false;
    }
    combinator = part.combinator;
  }
  return true;
}

/** Whether an element matches a selector list, as `Element.matches` answers. Throws on what it cannot read. */
export function matchesSelector(element: Matchable, selector: string): boolean {
  const list = splitList(selector);
  if (list.length === 0) throw new SyntaxError("an empty selector");
  return list.some((one) => matchesComplex(element, one));
}

/** A rule a sheet holds, with the browser's class name. */
export class CSSStyleRule {
  readonly style: Block;
  cssRules: never[] = [];
  constructor(
    public selectorText: string,
    public parentStyleSheet: PageSheet,
  ) {
    this.style = new Block();
  }
}

/** A stylesheet that takes one rule at a time, and refuses a selector that does not parse. */
export class PageSheet {
  cssRules: CSSStyleRule[] = [];
  disabled = false;
  href: string | null = null;
  ownerNode: null = null;
  media = { mediaText: "" };
  /** The text `replaceSync` set last. */
  text = "";

  constructor(private readonly page: PageDocument) {}

  insertRule(text: string, index = 0): number {
    const found = /^\s*([^{}]+?)\s*\{\s*\}\s*$/.exec(text);
    if (!found?.[1] || found[1].startsWith("@")) throw new SyntaxError(`Failed to parse the rule '${text}'.`);
    // A selector the page cannot read is no rule: matches() is how the fake parses it.
    matchesSelector(this.page.documentElement, found[1].replace(/::?[\w-]+$/, ""));
    this.cssRules.splice(index, 0, new CSSStyleRule(found[1], this));
    return index;
  }

  replaceSync(text: string): void {
    this.text = text;
  }
}

export class PageElement {
  parentElement: PageElement | null = null;
  assignedSlot = null;
  readonly attributes = new Map<string, string>();
  /** The states the element has for real, as a pointer on it would give. */
  readonly states = new Set<string>();
  readonly style = new Block();
  readonly tagName: string;

  constructor(
    readonly ownerDocument: PageDocument,
    tag: string,
    attrs: Record<string, string> = {},
  ) {
    this.tagName = tag.toUpperCase();
    for (const [name, value] of Object.entries(attrs)) this.attributes.set(name, value);
  }

  get isConnected(): boolean {
    return true;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getRootNode(): PageDocument {
    return this.ownerDocument;
  }

  matches(selector: string): boolean {
    return matchesSelector(this, selector);
  }

  append(...children: PageElement[]): this {
    for (const child of children) child.parentElement = this;
    return this;
  }
}

/** A document whose window adopts constructed sheets. */
export class PageDocument {
  readonly nodeType = 9;
  styleSheets: object[] = [];
  adoptedStyleSheets: object[] = [];
  readonly documentElement: PageElement;
  readonly defaultView: { CSSStyleSheet: typeof PageSheet; CSS: { supports(name: string, value: string): boolean; escape(text: string): string } };
  head = null;

  constructor() {
    const page = this;
    // Each sheet made through the window belongs to this page.
    class Sheet extends PageSheet {
      constructor() {
        super(page);
      }
    }
    this.defaultView = {
      CSSStyleSheet: Sheet,
      CSS: { supports: (_name, value) => !/;|nope/.test(value), escape: (text) => text.replace(/[^\w-]/g, (char) => `\\${char}`) },
    };
    this.documentElement = new PageElement(this, "html");
  }

  querySelector(): null {
    return null;
  }
}

export function asElement(element: PageElement): Element {
  return element as unknown as Element;
}
