import { annotationOf } from "./annotations";
import { resolveMaxLines, sourceLine } from "./stack";
import type { MarkLookup } from "./pagemarks";
import type { ResolvedSource } from "./types";

/**
 * Where an element came from on a page React does not render: the source
 * file Astro, Svelte or Vue marks it with in development.
 */
interface Mark {
  file: string;
  line: number | null;
  column: number | null;
  name: string;
}

/** `/repo/web/src/pages/a.astro` is `src/pages/a.astro`, a path from the project. */
export function projectPath(file: string): string {
  const path = file.replace(/\\/g, "/");
  if (!path.startsWith("/") && !/^[a-z]:\//i.test(path)) return path;
  const src = path.lastIndexOf("/src/");
  if (src !== -1) return path.slice(src + 1);
  return path.split("/").filter(Boolean).slice(-2).join("/");
}

/** `src/layouts/Base.astro` is `Base`. */
function fileName(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Astro's `line:col` points past the start tag, so only the line is kept. */
function astroMark(element: Element, marks: MarkLookup | null): Mark | null {
  const found = annotationOf(element) ?? marks?.(element);
  if (!found?.file) return null;
  const file = projectPath(found.file);
  const line = Number.parseInt(found.loc ?? "", 10);
  return { file, line: Number.isFinite(line) ? line : null, column: null, name: fileName(file) };
}

/** Svelte counts columns from 0, an editor from 1. */
function svelteMark(element: Element): Mark | null {
  const loc = field(field(element, "__svelte_meta"), "loc");
  const path = text(field(loc, "file"));
  if (!path) return null;
  const file = projectPath(path);
  const column = count(field(loc, "column"));
  const line = count(field(loc, "line"));
  return { file, line, column: column === null ? null : column + 1, name: fileName(file) };
}

function vueMark(element: Element): Mark | null {
  const type = field(field(element, "__vueParentComponent"), "type");
  const path = text(field(type, "__file"));
  if (!path) return null;
  const file = projectPath(path);
  const name = text(field(type, "__name")) ?? text(field(type, "name")) ?? fileName(file);
  return { file, line: null, column: null, name };
}

function markOf(element: Element, marks: MarkLookup | null): Mark | null {
  return astroMark(element, marks) ?? svelteMark(element) ?? vueMark(element);
}

function toSource(mark: Mark): ResolvedSource {
  return {
    filePath: mark.file,
    lineNumber: mark.line,
    columnNumber: mark.column,
    componentName: mark.name,
    origin: "app",
    symbolicated: mark.line !== null,
  };
}

export interface MarkupTrace {
  text: string;
  /** The element's own source, the first line. */
  source: ResolvedSource;
}

/**
 * `in Name (at path:line)` lines from the element's framework source and the
 * sources above it, one per file, so a component shows with the page or the
 * layout that uses it. Null where no framework marked the element. Astro's
 * marks come from the page, as kept, or else from its html fetched again.
 */
export function markupTrace(
  element: Element,
  maxLines?: number,
  marks: MarkLookup | null = null,
): MarkupTrace | null {
  const max = resolveMaxLines(maxLines);
  const sources: ResolvedSource[] = [];
  const files = new Set<string>();
  for (let at: Element | null = element; at && sources.length < max; at = at.parentElement) {
    const mark = markOf(at, marks);
    if (!mark || files.has(mark.file)) continue;
    files.add(mark.file);
    sources.push(toSource(mark));
  }
  const first = sources[0];
  if (!first) return null;
  return { text: sources.map((source) => sourceLine(source)).join(""), source: first };
}
