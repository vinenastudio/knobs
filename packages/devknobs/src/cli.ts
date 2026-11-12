#!/usr/bin/env node
/**
 * `npx @vinena/knobs init`: mounts devknobs in the project it is run in, as
 * the installation prompt in the README has an agent do by hand. It reads and
 * writes files only: no network, and the package manager is never run, its
 * command is printed instead.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** Every string the command prints. All but the eight marked are the README's own words. */
export const MESSAGES = {
  install: {
    npm: "npm i -D @vinena/knobs",
    pnpm: "pnpm add -D @vinena/knobs",
    yarn: "yarn add -D @vinena/knobs",
    bun: "bun add -d @vinena/knobs",
  } satisfies Record<PackageManager, string>,
  next: "Render that component once in app/layout (App Router) or pages/_app (Pages Router).",
  entry:
    'call if (import.meta.env.DEV) import("@vinena/knobs").then(({ mount }) => mount()); in the client entry, or in a mount effect of the root component in an SSR app.',
  plain:
    'add <script src="//unpkg.com/@vinena/knobs/dist/index.global.js"></script> to the page. It mounts itself. Keep it out of the deployed page.',
  production:
    "Keep knobs out of production builds. A static import stays in the bundle even behind a dev check, so gate the import itself as above. If the project has a build script, run it and check that the output has no knobs.",
  early:
    'If the app reads media queries, the time or the user agent while it boots, or renders with React, add the early script as the first element in <head>, in development only: <script src="//unpkg.com/@vinena/knobs/dist/early.global.js"></script>',
  open: "press ⇧K, or click the handle on the right edge of the window, to open the panel.",
  reference: "the full reference, every detail in one file, is at https://knobs.dev/llms-full.txt",
  // MERT WRITES
  created: (path: string) => `created ${path}`,
  // MERT WRITES
  changed: (path: string) => `changed ${path}`,
  // MERT WRITES
  unchanged: (path: string) => `no change: ${path}`,
  // MERT WRITES
  unknown: "not found",
  // MERT WRITES
  dryRun: "dry run",
  // MERT WRITES
  usage: "usage: knobs init [--dry-run]",
  // MERT WRITES
  packageJson: "error: package.json",
  // MERT WRITES
  writeFailed: (path: string, code: string) => `error: ${path} ${code}`,
} as const;

/** An import of devknobs, static or dynamic, as a file that mounts it has. */
const MOUNTS = /(?:\bfrom\s*|\bimport\s*\(\s*)(["'])@vinena\/knobs(?:\/react)?\1/;

/** The relative imports of a module, the path in group 2. */
const RELATIVE_IMPORTS = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.\.?\/[^"']+)\1/g;

/** The end of line a text uses: CRLF where it has one, else LF. */
function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** The line a client entry gets, as the installation prompt has it. */
export const MOUNT_LINE = 'if (import.meta.env.DEV) import("@vinena/knobs").then(({ mount }) => mount());';

const COMPONENT_NAME = "dev-knobs";

/**
 * The client component a Next.js app gets, in the installation prompt's own
 * code. Joined from lines, so no line of the built cli is the directive alone,
 * which `scripts/useclient.ts` refuses below a module's first line.
 */
export const COMPONENT = [
  '"use client";',
  "",
  'import dynamic from "next/dynamic";',
  "",
  'const DevKnobs = process.env.NODE_ENV === "development" ? dynamic(() => import("@vinena/knobs/react").then((m) => m.DevKnobs), { ssr: false }) : null;',
  "",
  "export function DevPanel() {",
  "  return <>{DevKnobs && <DevKnobs />}</>;",
  "}",
  "",
].join("\n");

const COMPONENT_IMPORT = `import { DevPanel } from "./${COMPONENT_NAME}";`;
const COMPONENT_RENDER = "<DevPanel />";

/** The package manager of a folder with these files, by its lockfile. */
export function packageManager(files: (path: string) => boolean): PackageManager {
  if (files("pnpm-lock.yaml")) return "pnpm";
  if (files("yarn.lock")) return "yarn";
  if (files("bun.lock") || files("bun.lockb")) return "bun";
  return "npm";
}

export type Framework =
  | { kind: "next-app"; layout: string }
  | { kind: "next-pages"; app: string }
  | { kind: "entry"; entry: string; make: boolean }
  | { kind: "plain" }
  | { kind: "unknown" };

const SCRIPT_EXTENSIONS = ["tsx", "jsx", "ts", "js"] as const;

function firstOf(files: (path: string) => boolean, stems: readonly string[]): string | null {
  for (const stem of stems) {
    for (const extension of SCRIPT_EXTENSIONS) {
      if (files(`${stem}.${extension}`)) return `${stem}.${extension}`;
    }
  }
  return null;
}

/**
 * The `src` of the first module script of a page that `files` has, as a path
 * from the page's folder. Scripts in html comments do not count.
 */
export function moduleEntry(html: string, files: (path: string) => boolean = () => true): string | null {
  for (const tag of html.replace(/<!--[\s\S]*?-->/g, "").match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype\s*=\s*["']module["']/i.test(tag)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || /^([a-z]+:)?\/\//i.test(src)) continue;
    const path = src.replace(/^\.?\//, "");
    if (files(path)) return path;
  }
  return null;
}

/** Whether a parsed package.json lists a package, for the app or for development. */
function depends(pkg: unknown, name: string): boolean {
  return ["dependencies", "devDependencies"].some((field) => {
    const listed: unknown = typeof pkg === "object" && pkg !== null ? Reflect.get(pkg, field) : null;
    return typeof listed === "object" && listed !== null && name in listed;
  });
}

/**
 * Where devknobs mounts in a project: `pkg` is its parsed package.json, null
 * with none, and `files` and `read` look in its folder.
 */
export function framework(
  pkg: unknown,
  files: (path: string) => boolean,
  read: (path: string) => string = () => "",
): Framework {
  if (pkg === null) return { kind: "plain" };
  const has = (name: string): boolean => depends(pkg, name);
  if (has("next")) {
    const layout = firstOf(files, ["app/layout", "src/app/layout"]);
    if (layout) return { kind: "next-app", layout };
    const app = firstOf(files, ["pages/_app", "src/pages/_app"]);
    return app ? { kind: "next-pages", app } : { kind: "unknown" };
  }
  if (has("vite") && files("index.html")) {
    const entry = moduleEntry(read("index.html"), files);
    if (entry) return { kind: "entry", entry, make: false };
  }
  if (has("@sveltejs/kit")) {
    const entry = ["src/hooks.client.ts", "src/hooks.client.js"].find(files);
    return { kind: "entry", entry: entry ?? "src/hooks.client.ts", make: !entry };
  }
  const entry = ["app/entry.client.tsx", "app/entry.client.jsx", "src/client.tsx", "src/client.jsx"].find(files);
  return entry ? { kind: "entry", entry, make: false } : { kind: "unknown" };
}

/**
 * A layout with the component imported and rendered before `</body>`, in the
 * layout's own end of line, or null where it has no `</body>` or more than one.
 */
export function withPanel(layout: string): string | null {
  const close = layout.indexOf("</body>");
  if (close < 0 || close !== layout.lastIndexOf("</body>")) return null;
  const eol = eolOf(layout);
  const lineStart = layout.lastIndexOf("\n", close) + 1;
  const indent = layout.slice(lineStart, close);
  const rendered = /^[ \t]*$/.test(indent)
    ? `${layout.slice(0, lineStart)}${indent}${indent.includes("\t") ? "\t" : "  "}${COMPONENT_RENDER}${eol}${layout.slice(lineStart)}`
    : `${layout.slice(0, close)}${COMPONENT_RENDER}${layout.slice(close)}`;
  const imports = [
    ...rendered.matchAll(/^import\s+["'][^"']+["'];?[ \t]*(?=\r?$)|^import\b[^;]*?\bfrom\s*["'][^"']+["'];?[ \t]*(?=\r?$)/gm),
  ];
  const last = imports.at(-1);
  if (last) {
    const end = last.index + last[0].length;
    return `${rendered.slice(0, end)}${eol}${COMPONENT_IMPORT}${rendered.slice(end)}`;
  }
  const directive = /^\s*(["'])use \w+\1;?[ \t]*\r?\n/.exec(rendered);
  const at = directive ? directive[0].length : 0;
  return `${rendered.slice(0, at)}${COMPONENT_IMPORT}${eol}${rendered.slice(at)}`;
}

/** Whether a path from `dir` stays in it once every symlink on the way is followed. */
function inside(dir: string, path: string): boolean {
  try {
    const root = realpathSync(dir);
    let at = resolve(dir, path);
    const rest: string[] = [];
    while (!existsSync(at)) {
      if (lstatSync(at, { throwIfNoEntry: false })) return false;
      const up = dirname(at);
      if (up === at) return false;
      rest.unshift(basename(at));
      at = up;
    }
    const from = relative(root, join(realpathSync(at), ...rest));
    return from !== "" && from !== ".." && !from.startsWith(`..${sep}`) && !isAbsolute(from);
  } catch {
    return false;
  }
}

/**
 * Whether a module mounts devknobs: it imports it, or one of its relative
 * imports does. `look` gives a file's text, null where it has none.
 */
function mountsKnobs(path: string, source: string, look: (path: string) => string | null): boolean {
  if (MOUNTS.test(source)) return true;
  for (const [, , spec = ""] of source.matchAll(RELATIVE_IMPORTS)) {
    const base = join(dirname(path), spec);
    const candidates = [
      base,
      ...SCRIPT_EXTENSIONS.map((extension) => `${base}.${extension}`),
      ...SCRIPT_EXTENSIONS.map((extension) => join(base, `index.${extension}`)),
    ];
    for (const candidate of candidates) {
      const text = look(candidate);
      if (text === null) continue;
      if (MOUNTS.test(text)) return true;
      break;
    }
  }
  return false;
}

export interface Edit {
  /** From the project's folder. */
  path: string;
  kind: "create" | "change";
  content: string;
}

export interface Plan {
  dir: string;
  edits: Edit[];
  /** What to print, in order. */
  lines: string[];
  /** 1 where the mount is left to do by hand. */
  code: 0 | 1;
}

/** What `init` does in a folder: its edits and its report. Reads only. */
export function plan(dir: string): Plan {
  const files = (path: string): boolean => existsSync(join(dir, path));
  const read = (path: string): string => readFileSync(join(dir, path), "utf8");
  const look = (path: string): string | null => {
    try {
      return inside(dir, path) && statSync(join(dir, path)).isFile() ? read(path) : null;
    } catch {
      return null;
    }
  };
  let pkg: unknown = null;
  if (files("package.json")) {
    try {
      pkg = JSON.parse(read("package.json").replace(/^﻿/, ""));
    } catch {
      return { dir, edits: [], lines: [MESSAGES.packageJson], code: 1 };
    }
  }
  const found = framework(pkg, files, read);
  const edits: Edit[] = [];
  const lines: string[] = [];
  let code: 0 | 1 = 0;
  const byHand = (step: string, missing: boolean): void => {
    if (missing) lines.push(MESSAGES.unknown);
    lines.push(step);
    code = 1;
  };
  const edit = (path: string, kind: Edit["kind"], content: string): void => {
    edits.push({ path, kind, content });
    lines.push(kind === "create" ? MESSAGES.created(path) : MESSAGES.changed(path));
  };
  if (found.kind !== "plain") lines.push(MESSAGES.install[packageManager(files)]);

  if (found.kind === "next-app" || found.kind === "next-pages") {
    const beside = found.kind === "next-app" ? found.layout : found.app;
    const typed = /\.tsx?$/.test(beside);
    // A file in `pages` is a route, so there the component goes beside that folder.
    const folder = found.kind === "next-app" ? dirname(beside) : dirname(dirname(beside));
    const component = join(folder, `${COMPONENT_NAME}.${typed ? "tsx" : "jsx"}`);
    if (!inside(dir, beside) || !inside(dir, component)) byHand(MESSAGES.next, false);
    else {
      const source = read(beside);
      const eol = eolOf(source);
      const ours = source.includes(COMPONENT_IMPORT);
      const makeComponent = (): void => {
        if (files(component)) lines.push(MESSAGES.unchanged(component));
        else edit(component, "create", COMPONENT.replaceAll("\n", eol));
      };
      if (ours || mountsKnobs(beside, source, look)) {
        if (ours) makeComponent();
        lines.push(MESSAGES.unchanged(beside));
      } else if (found.kind === "next-pages") {
        makeComponent();
        byHand(MESSAGES.next, false);
      } else {
        const next = withPanel(source);
        makeComponent();
        if (next === null) byHand(MESSAGES.next, false);
        else edit(beside, "change", next);
      }
    }
  } else if (found.kind === "entry") {
    if (!inside(dir, found.entry)) byHand(MESSAGES.entry, false);
    else if (found.make) edit(found.entry, "create", `${MOUNT_LINE}\n`);
    else {
      const source = read(found.entry);
      const eol = eolOf(source);
      if (MOUNTS.test(source)) lines.push(MESSAGES.unchanged(found.entry));
      else edit(found.entry, "change", `${source}${source === "" || source.endsWith("\n") ? "" : eol}${MOUNT_LINE}${eol}`);
    }
  } else if (found.kind === "plain") byHand(MESSAGES.plain, false);
  else byHand(depends(pkg, "next") ? MESSAGES.next : MESSAGES.entry, true);

  lines.push(MESSAGES.production, MESSAGES.early, MESSAGES.open, MESSAGES.reference);
  return { dir, edits, lines, code };
}

/**
 * Write a plan's edits, the changes to files before the new files. On an
 * error the changed files get their text back, and the line to print is given.
 */
export function apply(planned: Plan): string | null {
  const ordered = [...planned.edits].sort((a, b) => Number(a.kind === "create") - Number(b.kind === "create"));
  const changed: { file: string; before: string }[] = [];
  for (const { path, kind, content } of ordered) {
    const file = join(planned.dir, path);
    try {
      const before = kind === "change" ? readFileSync(file, "utf8") : null;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content, { flag: kind === "create" ? "wx" : "w" });
      if (before !== null) changed.push({ file, before });
    } catch (error) {
      for (const { file: back, before } of changed) {
        try {
          writeFileSync(back, before);
        } catch {
          // The error line below is still the one to print.
        }
      }
      const code: unknown = error instanceof Error ? Reflect.get(error, "code") : undefined;
      return MESSAGES.writeFailed(path, typeof code === "string" ? code : String(error));
    }
  }
  return null;
}

/** Run the command with these arguments in a folder, and give its exit code. */
export function run(args: readonly string[], dir: string, print: (line: string) => void = console.log): number {
  const [command, ...flags] = args;
  if (command !== "init" || flags.some((flag) => flag !== "--dry-run")) {
    print(MESSAGES.usage);
    return 1;
  }
  const dry = flags.includes("--dry-run");
  const planned = plan(dir);
  if (dry) print(MESSAGES.dryRun);
  else {
    const failed = apply(planned);
    if (failed !== null) {
      print(failed);
      return 1;
    }
  }
  for (const line of planned.lines) print(line);
  return planned.code;
}

function isMain(): boolean {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) process.exitCode = run(process.argv.slice(2), process.cwd());
