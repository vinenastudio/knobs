/**
 * A small page for the DOM tree: nodes with the types, names, attributes and
 * children the tree reads, a document with its `<html>` and `<body>`, and
 * open shadow roots. Built with the helpers, never by hand.
 */

const HTML = "http://www.w3.org/1999/xhtml";
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

  get firstChild(): PageNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): PageNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get documentElement(): PageNode | null {
    return this.childNodes.find((node) => node.nodeType === 1) ?? null;
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
    node.parentNode?.removeChild(node);
    const at = before ? this.childNodes.indexOf(before) : -1;
    this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, node);
    node.parentNode = this;
    return node;
  }

  removeChild(node: PageNode): PageNode {
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
