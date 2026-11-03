/**
 * A small page for the DOM tree: nodes with the types, names, attributes and
 * children the tree reads, a document with its `<html>` and `<body>`, and
 * open shadow roots. Built with the helpers, never by hand.
 */

const HTML = "http://www.w3.org/1999/xhtml";

/** Elements with no end tag. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Text as the browser escapes it in markup. */
function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const SVG = "http://www.w3.org/2000/svg";

export class PageNode {
  childNodes: PageNode[] = [];
  parentNode: PageNode | null = null;
  attributes: { name: string; value: string }[] = [];
  shadowRoot: PageNode | null = null;
  namespaceURI: string | null = HTML;
  ownerDocument: PageNode | null = null;
  defaultView: object | null = null;
  name = "";
  publicId = "";
  systemId = "";

  constructor(
    readonly nodeType: number,
    readonly nodeName: string,
    public nodeValue: string | null = null,
  ) {}

  get localName(): string {
    return this.nodeType === 1 ? (this.namespaceURI === HTML ? this.nodeName.toLowerCase() : this.nodeName) : "";
  }

  get tagName(): string {
    return this.nodeName;
  }

  get firstChild(): PageNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): PageNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get documentElement(): PageNode | null {
    return this.childNodes.find((node) => node.nodeType === 1) ?? null;
  }

  get head(): PageNode | null {
    return this.documentElement?.childNodes.find((node) => node.nodeName === "HEAD") ?? null;
  }

  /** An element made in this document, as a style devknobs adds. */
  createElement(tag: string): PageNode {
    const made = elem(tag);
    made.ownerDocument = this;
    return made;
  }

  appendChild(node: PageNode): PageNode {
    return this.insertBefore(node, null);
  }

  get body(): PageNode | null {
    return this.documentElement?.childNodes.find((node) => node.nodeName === "BODY") ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.some((attr) => attr.name === name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.find((attr) => attr.name === name)?.value ?? null;
  }

  setAttribute(name: string, value: string): void {
    const had = this.attributes.find((attr) => attr.name === name);
    if (had) had.value = value;
    else this.attributes.push({ name, value });
  }

  append(...nodes: PageNode[]): this {
    for (const node of nodes) {
      node.parentNode = this;
      this.childNodes.push(node);
    }
    return this;
  }

  /** Every element under this one, for `*`, or with the attribute, for `[name]`. */
  querySelectorAll(selector: string): PageNode[] {
    const name = selector === "*" ? null : selector.slice(1, -1);
    return this.childNodes.flatMap((child) => [...(child.nodeType === 1 && (name === null || child.hasAttribute(name)) ? [child] : []), ...child.querySelectorAll(selector)]);
  }

  cloneNode(deep = false): PageNode {
    const copy = new PageNode(this.nodeType, this.nodeName, this.nodeValue);
    copy.namespaceURI = this.namespaceURI;
    copy.ownerDocument = this.ownerDocument;
    copy.attributes = this.attributes.map((attr) => ({ ...attr }));
    if (deep) copy.append(...this.childNodes.map((child) => child.cloneNode(true)));
    return copy;
  }

  /** The markup of an element as the browser writes it: values and text escaped, no end tag on a void element. A text's text, escaped. */
  get outerHTML(): string {
    if (this.nodeType === 3) return escapeText(this.nodeValue ?? "");
    if (this.nodeType === 8) return `<!--${this.nodeValue ?? ""}-->`;
    if (this.nodeType !== 1) return this.nodeValue ?? "";
    const attrs = this.attributes.map((attr) => ` ${attr.name}="${escapeText(attr.value).replace(/"/g, "&quot;")}"`).join("");
    if (VOID.has(this.localName)) return `<${this.localName}${attrs}>`;
    return `<${this.localName}${attrs}>${this.childNodes.map((child) => child.outerHTML).join("")}</${this.localName}>`;
  }

  /** The first node under this one with the attribute, for `[name]` alone. */
  querySelector(selector: string): PageNode | null {
    const name = selector.slice(1, -1);
    for (const child of this.childNodes) {
      if (child.hasAttribute(name)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  removeAttribute(name: string): void {
    this.attributes = this.attributes.filter((attr) => attr.name !== name);
  }

  /** On the page: its document above it, through a shadow root's host too. */
  get isConnected(): boolean {
    let at: PageNode | null = this;
    while (at) {
      if (at.nodeType === 9) return true;
      at = at.parentNode ?? Reflect.get(at, "host") ?? null;
    }
    return false;
  }

  get nextSibling(): PageNode | null {
    const list = this.parentNode?.childNodes ?? [];
    return list[list.indexOf(this) + 1] ?? null;
  }

  get previousSibling(): PageNode | null {
    const list = this.parentNode?.childNodes ?? [];
    return list[list.indexOf(this) - 1] ?? null;
  }

  insertBefore(node: PageNode, before: PageNode | null): PageNode {
    if (before && !this.childNodes.includes(before)) throw new Error("NotFoundError: the reference node is not a child of this node");
    node.parentNode?.removeChild(node);
    const at = before ? this.childNodes.indexOf(before) : -1;
    this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, node);
    node.parentNode = this;
    return node;
  }

  removeChild(node: PageNode): PageNode {
    if (!this.childNodes.includes(node)) throw new Error("NotFoundError: the node is not a child of this node");
    this.childNodes = this.childNodes.filter((one) => one !== node);
    node.parentNode = null;
    return node;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  getRootNode(): PageNode {
    let at: PageNode = this;
    while (at.parentNode) at = at.parentNode;
    return at;
  }
}

/** A page node as the tree takes it. */
export function as(node: PageNode): Node {
  return node as unknown as Node;
}

/** The document every node made after it belongs to. */
let current: PageNode | null = null;

function owned(node: PageNode): PageNode {
  node.ownerDocument = current;
  return node;
}

export function elem(tag: string, attrs: Record<string, string> = {}, ...children: PageNode[]): PageNode {
  const node = owned(new PageNode(1, tag.toUpperCase()));
  for (const [name, value] of Object.entries(attrs)) node.attributes.push({ name, value });
  return node.append(...children);
}

/** An element of svg, its tag kept as written. */
export function svg(tag: string, attrs: Record<string, string> = {}, ...children: PageNode[]): PageNode {
  const node = owned(new PageNode(1, tag));
  node.namespaceURI = SVG;
  for (const [name, value] of Object.entries(attrs)) node.attributes.push({ name, value });
  return node.append(...children);
}

export function text(value: string): PageNode {
  return owned(new PageNode(3, "#text", value));
}

export function comment(value: string): PageNode {
  return owned(new PageNode(8, "#comment", value));
}

/** An open shadow root on a host, holding the nodes given. */
export function shadow(host: PageNode, ...children: PageNode[]): PageNode {
  const root = Object.assign(owned(new PageNode(11, "#document-fragment")), { host });
  host.shadowRoot = root;
  return root.append(...children);
}

/** A document: `<!DOCTYPE html>`, then its `<html>` with what `build` puts in it, made in it. */
export function page(build: () => PageNode[]): PageNode {
  const doc = new PageNode(9, "#document");
  doc.defaultView = {};
  current = doc;
  const type = owned(new PageNode(10, "html"));
  type.name = "html";
  doc.append(type, elem("html", { lang: "en" }, ...build()));
  own(doc, doc);
  return doc;
}

/** Every node under one belongs to the document, those made before it too. */
function own(node: PageNode, doc: PageNode): void {
  for (const child of [...node.childNodes, ...(node.shadowRoot ? [node.shadowRoot] : [])]) {
    child.ownerDocument = doc;
    own(child, doc);
  }
}
