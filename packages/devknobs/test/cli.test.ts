import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { COMPONENT, framework, MESSAGES, moduleEntry, MOUNT_LINE, packageManager, run, withPanel } from "../src/cli";

const made: string[] = [];

/** A project folder under the OS temp folder with these files. */
function project(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), "knobs-init-"));
  made.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

/** Every file of a folder with its text, by path. */
function snapshot(dir: string): Record<string, string> {
  const all = readdirSync(dir, { recursive: true, withFileTypes: true });
  return Object.fromEntries(
    all
      .filter((one) => one.isFile())
      .map((one) => join(one.parentPath, one.name))
      .sort()
      .map((file) => [file.slice(dir.length + 1), readFileSync(file, "utf8")]),
  );
}

/** Run the command in a folder: its exit code and what it printed. */
function init(dir: string, ...flags: string[]): { code: number; lines: string[] } {
  const lines: string[] = [];
  const code = run(["init", ...flags], dir, (line) => lines.push(line));
  return { code, lines };
}

const pkg = (dependencies: Readonly<Record<string, string>>): string => JSON.stringify({ dependencies });

const LAYOUT = [
  'import type { Metadata } from "next";',
  'import "./globals.css";',
  "",
  "export default function RootLayout({ children }: { children: React.ReactNode }) {",
  "  return (",
  '    <html lang="en">',
  "      <body>",
  "        {children}",
  "      </body>",
  "    </html>",
  "  );",
  "}",
  "",
].join("\n");

const TAIL = [MESSAGES.production, MESSAGES.early, MESSAGES.open, MESSAGES.reference];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the package manager", () => {
  test("is the lockfile's, pnpm first, and npm with none", () => {
    const of = (...names: string[]) => packageManager((path) => names.includes(path));
    expect(of("pnpm-lock.yaml", "yarn.lock")).toBe("pnpm");
    expect(of("yarn.lock", "bun.lock")).toBe("yarn");
    expect(of("bun.lock")).toBe("bun");
    expect(of("bun.lockb")).toBe("bun");
    expect(of("package-lock.json")).toBe("npm");
    expect(of()).toBe("npm");
  });

  test("gives the install line that is printed first", () => {
    for (const [lock, line] of [
      ["pnpm-lock.yaml", "pnpm add -D @vinena/knobs"],
      ["yarn.lock", "yarn add -D @vinena/knobs"],
      ["bun.lock", "bun add -d @vinena/knobs"],
      ["package-lock.json", "npm i -D @vinena/knobs"],
    ] as const) {
      const dir = project({ "package.json": pkg({ vite: "7" }), [lock]: "", "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": "" });
      expect(init(dir, "--dry-run").lines[1]).toBe(line);
    }
  });
});

describe("the framework", () => {
  test("is read from the dependencies and the files", () => {
    const of = (deps: Record<string, string>, names: string[], html = "") =>
      framework({ devDependencies: deps }, (path) => names.includes(path), () => html);
    expect(of({ next: "16" }, ["src/app/layout.jsx"])).toEqual({ kind: "next-app", layout: "src/app/layout.jsx" });
    expect(of({ next: "16" }, ["pages/_app.tsx"])).toEqual({ kind: "next-pages", app: "pages/_app.tsx" });
    expect(of({ next: "16" }, [])).toEqual({ kind: "unknown" });
    expect(of({ vite: "7" }, ["index.html", "src/main.tsx"], '<script type="module" src="/src/main.tsx"></script>')).toEqual({
      kind: "entry",
      entry: "src/main.tsx",
      make: false,
    });
    expect(of({ "@sveltejs/kit": "2", vite: "7" }, ["src/hooks.client.js"])).toEqual({ kind: "entry", entry: "src/hooks.client.js", make: false });
    expect(of({ "@sveltejs/kit": "2" }, [])).toEqual({ kind: "entry", entry: "src/hooks.client.ts", make: true });
    expect(of({ "react-router": "7" }, ["app/entry.client.tsx"])).toEqual({ kind: "entry", entry: "app/entry.client.tsx", make: false });
    expect(of({ vite: "7" }, ["src/client.tsx"])).toEqual({ kind: "entry", entry: "src/client.tsx", make: false });
    expect(of({ vite: "7" }, [])).toEqual({ kind: "unknown" });
    expect(framework(null, () => false)).toEqual({ kind: "plain" });
  });

  test("takes a page's first local module script as the entry", () => {
    expect(moduleEntry('<script src="/a.js"></script><script type="module" src="./src/main.ts"></script>')).toBe("src/main.ts");
    expect(moduleEntry('<script type="module" src="https://cdn.example/x.js"></script>')).toBeNull();
    expect(moduleEntry("<body></body>")).toBeNull();
  });
});

describe("what it writes", () => {
  const prompt = readFileSync(join(import.meta.dir, "..", "README.md"), "utf8");

  test("is the installation prompt's own code", () => {
    expect(prompt).toContain(MOUNT_LINE);
    for (const piece of [
      '"use client"',
      'import dynamic from "next/dynamic"',
      'const DevKnobs = process.env.NODE_ENV === "development" ? dynamic(() => import("@vinena/knobs/react").then((m) => m.DevKnobs), { ssr: false }) : null;',
      "{DevKnobs && <DevKnobs />}",
    ]) {
      expect(prompt).toContain(piece);
      expect(COMPONENT).toContain(piece);
    }
    expect(COMPONENT.startsWith('"use client";\n')).toBe(true);
  });

  test("prints the prompt's own steps", () => {
    for (const line of [MESSAGES.install.npm, MESSAGES.next, MESSAGES.entry, MESSAGES.plain, MESSAGES.production, MESSAGES.early]) {
      expect(prompt).toContain(line);
    }
  });
});

describe("init", () => {
  test("a Next.js app router app gets the component and one render in the layout", () => {
    const dir = project({ "package.json": pkg({ next: "16" }), "pnpm-lock.yaml": "", "app/layout.tsx": LAYOUT });
    const { code, lines } = init(dir);
    expect(code).toBe(0);
    expect(lines).toEqual(["pnpm add -D @vinena/knobs", "created app/dev-knobs.tsx", "changed app/layout.tsx", ...TAIL]);
    expect(readFileSync(join(dir, "app/dev-knobs.tsx"), "utf8")).toBe(COMPONENT);
    expect(readFileSync(join(dir, "app/layout.tsx"), "utf8")).toBe(
      LAYOUT.replace('import "./globals.css";', 'import "./globals.css";\nimport { DevPanel } from "./dev-knobs";').replace(
        "      </body>",
        "        <DevPanel />\n      </body>",
      ),
    );
  });

  test("a layout in plain JavaScript gets a jsx component, and one with `</body>` in a line gets the render before it", () => {
    const layout = "export default function Layout({ children }) {\n  return <html><body>{children}</body></html>;\n}\n";
    const dir = project({ "package.json": pkg({ next: "16" }), "src/app/layout.js": layout });
    expect(init(dir).code).toBe(0);
    expect(existsSync(join(dir, "src/app/dev-knobs.jsx"))).toBe(true);
    expect(readFileSync(join(dir, "src/app/layout.js"), "utf8")).toBe(
      'import { DevPanel } from "./dev-knobs";\nexport default function Layout({ children }) {\n  return <html><body>{children}<DevPanel /></body></html>;\n}\n',
    );
  });

  test("a layout with no `</body>` gets the component only, and the step to do by hand", () => {
    const layout = "export default function Layout({ children }) {\n  return <Shell>{children}</Shell>;\n}\n";
    const dir = project({ "package.json": pkg({ next: "16" }), "app/layout.tsx": layout });
    const { code, lines } = init(dir);
    expect(code).toBe(1);
    expect(lines).toEqual(["npm i -D @vinena/knobs", "created app/dev-knobs.tsx", MESSAGES.next, ...TAIL]);
    expect(readFileSync(join(dir, "app/layout.tsx"), "utf8")).toBe(layout);
  });

  test("a Next.js pages router app gets the component beside pages, and _app is left alone", () => {
    const app = "export default function App({ Component, pageProps }) {\n  return <Component {...pageProps} />;\n}\n";
    const dir = project({ "package.json": pkg({ next: "16" }), "pages/_app.jsx": app });
    const { code, lines } = init(dir);
    expect(code).toBe(1);
    expect(lines).toEqual(["npm i -D @vinena/knobs", "created dev-knobs.jsx", MESSAGES.next, ...TAIL]);
    expect(readFileSync(join(dir, "dev-knobs.jsx"), "utf8")).toBe(COMPONENT);
    expect(readFileSync(join(dir, "pages/_app.jsx"), "utf8")).toBe(app);
  });

  test("a Vite app gets the one line at the end of its client entry", () => {
    const main = 'import { createRoot } from "react-dom/client";\ncreateRoot(document.body).render(null);';
    const dir = project({
      "package.json": pkg({ vite: "7" }),
      "yarn.lock": "",
      "index.html": '<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>',
      "src/main.tsx": main,
    });
    const { code, lines } = init(dir);
    expect(code).toBe(0);
    expect(lines).toEqual(["yarn add -D @vinena/knobs", "changed src/main.tsx", ...TAIL]);
    expect(readFileSync(join(dir, "src/main.tsx"), "utf8")).toBe(`${main}\n${MOUNT_LINE}\n`);
  });

  test("a SvelteKit app gets the line in its client hooks, made where there are none", () => {
    const fresh = project({ "package.json": pkg({ "@sveltejs/kit": "2", vite: "7" }), "bun.lock": "" });
    expect(init(fresh).lines).toEqual(["bun add -d @vinena/knobs", "created src/hooks.client.ts", ...TAIL]);
    expect(readFileSync(join(fresh, "src/hooks.client.ts"), "utf8")).toBe(`${MOUNT_LINE}\n`);
    const hooks = "export const handleError = () => {};\n";
    const old = project({ "package.json": pkg({ "@sveltejs/kit": "2" }), "src/hooks.client.js": hooks });
    expect(init(old).lines).toEqual(["npm i -D @vinena/knobs", "changed src/hooks.client.js", ...TAIL]);
    expect(readFileSync(join(old, "src/hooks.client.js"), "utf8")).toBe(`${hooks}${MOUNT_LINE}\n`);
  });

  test("an app with a client entry file gets the line there", () => {
    for (const entry of ["app/entry.client.tsx", "src/client.tsx"]) {
      const dir = project({ "package.json": pkg({ vite: "7" }), [entry]: "hydrate();\n" });
      expect(init(dir).code).toBe(0);
      expect(readFileSync(join(dir, entry), "utf8")).toBe(`hydrate();\n${MOUNT_LINE}\n`);
    }
  });

  test("a second run changes nothing and says so", () => {
    for (const files of [
      { "package.json": pkg({ next: "16" }), "app/layout.tsx": LAYOUT },
      { "package.json": pkg({ next: "16" }), "pages/_app.tsx": "export default function App() {}\n" },
      { "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": "start();\n" },
      { "package.json": pkg({ "@sveltejs/kit": "2" }) },
    ] satisfies Record<string, string>[] as Record<string, string>[]) {
      const dir = project(files);
      init(dir);
      const once = snapshot(dir);
      const again = init(dir);
      expect(snapshot(dir)).toEqual(once);
      expect(again.lines.filter((line) => line.startsWith("created ") || line.startsWith("changed "))).toEqual([]);
      expect(again.lines.some((line) => line.startsWith("no change: "))).toBe(true);
    }
    const layout = project({ "package.json": pkg({ next: "16" }), "app/layout.tsx": LAYOUT });
    init(layout);
    expect(init(layout)).toEqual({ code: 0, lines: ["npm i -D @vinena/knobs", "no change: app/dev-knobs.tsx", "no change: app/layout.tsx", ...TAIL] });
  });

  test("a file that already has @vinena/knobs is left alone", () => {
    const main = 'import("@vinena/knobs").then(({ mount }) => mount());\n';
    const dir = project({ "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": main });
    expect(init(dir)).toEqual({ code: 0, lines: ["npm i -D @vinena/knobs", "no change: src/main.ts", ...TAIL] });
    expect(readFileSync(join(dir, "src/main.ts"), "utf8")).toBe(main);
  });

  test("a dry run prints the same report and writes nothing", () => {
    for (const files of [
      { "package.json": pkg({ next: "16" }), "app/layout.tsx": LAYOUT },
      { "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": "start();\n" },
      { "package.json": pkg({ "@sveltejs/kit": "2" }) },
    ] satisfies Record<string, string>[] as Record<string, string>[]) {
      const dir = project(files);
      const before = snapshot(dir);
      const dry = init(dir, "--dry-run");
      expect(snapshot(dir)).toEqual(before);
      expect(dry.lines[0]).toBe("dry run");
      const real = init(dir);
      expect(dry.lines.slice(1)).toEqual(real.lines);
      expect(dry.code).toBe(real.code);
    }
  });

  test("an unknown framework prints the prompt's step and exits 1, with nothing written", () => {
    const dir = project({ "package.json": pkg({ express: "5" }), "server.js": "listen();\n" });
    const before = snapshot(dir);
    expect(init(dir)).toEqual({ code: 1, lines: ["npm i -D @vinena/knobs", "not found", MESSAGES.entry, ...TAIL] });
    expect(snapshot(dir)).toEqual(before);
    const next = project({ "package.json": pkg({ next: "16" }) });
    expect(init(next)).toEqual({ code: 1, lines: ["npm i -D @vinena/knobs", "not found", MESSAGES.next, ...TAIL] });
  });

  test("a plain page with no package.json prints the script tag step and exits 1", () => {
    const dir = project({ "index.html": "<body></body>" });
    expect(init(dir)).toEqual({ code: 1, lines: [MESSAGES.plain, ...TAIL] });
    expect(snapshot(dir)).toEqual({ "index.html": "<body></body>" });
  });

  test("no command, or one it does not have, prints the usage and exits 1", () => {
    for (const args of [[], ["help"], ["init", "--force"]]) {
      const lines: string[] = [];
      expect(run(args, tmpdir(), (line) => lines.push(line))).toBe(1);
      expect(lines).toEqual(["usage: knobs init [--dry-run]"]);
    }
  });
});

describe("the layout edit", () => {
  test("puts the import after the last import, multi-line ones too", () => {
    const layout = 'import {\n  a,\n  b,\n} from "x";\n\nexport default () => (\n\t<body>\n\t</body>\n);\n';
    expect(withPanel(layout)).toBe(
      'import {\n  a,\n  b,\n} from "x";\nimport { DevPanel } from "./dev-knobs";\n\nexport default () => (\n\t<body>\n\t\t<DevPanel />\n\t</body>\n);\n',
    );
  });

  test("keeps a directive first where there is no import", () => {
    expect(withPanel('"use client";\nexport default () => <body></body>;\n')).toBe(
      '"use client";\nimport { DevPanel } from "./dev-knobs";\nexport default () => <body><DevPanel /></body>;\n',
    );
  });

  test("is null with no `</body>`", () => {
    expect(withPanel("export default () => null;\n")).toBeNull();
  });
});
