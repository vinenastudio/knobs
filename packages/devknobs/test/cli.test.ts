import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

  test("keeps CRLF in every line it adds, and a directive first", () => {
    expect(withPanel('"use client";\r\nexport default () => (\r\n  <body>\r\n  </body>\r\n);\r\n')).toBe(
      '"use client";\r\nimport { DevPanel } from "./dev-knobs";\r\nexport default () => (\r\n  <body>\r\n    <DevPanel />\r\n  </body>\r\n);\r\n',
    );
    expect(withPanel('import "./a.css";\r\nexport default () => <body></body>;\r\n')).toBe(
      'import "./a.css";\r\nimport { DevPanel } from "./dev-knobs";\r\nexport default () => <body><DevPanel /></body>;\r\n',
    );
  });

  test("keeps a directive first with comments before it or after it, and an import with a comment after it counts", () => {
    expect(withPanel('"use client"; // hooks below\nimport { useEffect } from "react"; // effect\nexport default () => <body></body>;\n')).toBe(
      '"use client"; // hooks below\nimport { useEffect } from "react"; // effect\nimport { DevPanel } from "./dev-knobs";\nexport default () => <body><DevPanel /></body>;\n',
    );
    expect(withPanel('// root layout\n"use client";\nexport default () => <body></body>;\n')).toBe(
      '// root layout\n"use client";\nimport { DevPanel } from "./dev-knobs";\nexport default () => <body><DevPanel /></body>;\n',
    );
    expect(withPanel('import "./globals.css"; /* styles */\nexport default () => <body></body>;\n')).toBe(
      'import "./globals.css"; /* styles */\nimport { DevPanel } from "./dev-knobs";\nexport default () => <body><DevPanel /></body>;\n',
    );
  });

  test("is null with a directive it cannot keep first", () => {
    expect(withPanel('"use client"; /* hooks below */\nexport default () => <body></body>;\n')).toBeNull();
  });

  test("reads long comment heads in one pass, and keeps a directive first", () => {
    const body = "export default ({ children }) => <html><body>{children}</body></html>;\n";
    const rendered = "export default ({ children }) => <html><body>{children}<DevPanel /></body></html>;\n";
    const urls = "// see https://nextjs.org/docs/app/api-reference/file-conventions/layout //\n".repeat(30);
    const layout = `${"/".repeat(80)}\n${urls}${body}`;
    const dir = project({ "package.json": pkg({ next: "16" }), "app/layout.tsx": layout });
    const start = performance.now();
    expect(init(dir).lines).toContain("changed app/layout.tsx");
    expect(performance.now() - start).toBeLessThan(200);
    expect(readFileSync(join(dir, "app/layout.tsx"), "utf8")).toBe(`import { DevPanel } from "./dev-knobs";\n${"/".repeat(80)}\n${urls}${rendered}`);
    const blocks = "/* a */\n".repeat(200);
    expect(withPanel(`${blocks}${body}`)).toBe(`import { DevPanel } from "./dev-knobs";\n${blocks}${rendered}`);
    expect(withPanel(`${blocks}"use client";\n${body}`)).toBe(`${blocks}"use client";\nimport { DevPanel } from "./dev-knobs";\n${rendered}`);
  });

  test("keeps a directive first with a doc comment before it and slashes in the comment after it, in LF or CRLF", () => {
    expect(withPanel('/** x **/\n"use client"; // a // b\nexport default () => <body></body>;\n')).toBe(
      '/** x **/\n"use client"; // a // b\nimport { DevPanel } from "./dev-knobs";\nexport default () => <body><DevPanel /></body>;\n',
    );
    expect(withPanel('/** x **/\r\n// c\r\n"use client"; // a // b\r\nexport default () => <body></body>;\r\n')).toBe(
      '/** x **/\r\n// c\r\n"use client"; // a // b\r\nimport { DevPanel } from "./dev-knobs";\r\nexport default () => <body><DevPanel /></body>;\r\n',
    );
    expect(withPanel('import "./a.css"; // a // b\r\nexport default () => <body></body>;\r\n')).toBe(
      'import "./a.css"; // a // b\r\nimport { DevPanel } from "./dev-knobs";\r\nexport default () => <body><DevPanel /></body>;\r\n',
    );
  });

  test("does not take a line in a template literal for an import", () => {
    expect(withPanel('import a from "a";\nconst t = `\nimport b from "b";\n`;\nexport default () => <body></body>;\n')).toBe(
      'import a from "a";\nimport { DevPanel } from "./dev-knobs";\nconst t = `\nimport b from "b";\n`;\nexport default () => <body><DevPanel /></body>;\n',
    );
  });

  test("is null with more than one `</body>`", () => {
    expect(withPanel("export default () => <body></body>;\n// never put scripts after </body>\n")).toBeNull();
  });
});

describe("what init leaves alone", () => {
  /** A line end with no CR before it. */
  const BARE_LF = /(?<!\r)\n/;

  test("a CRLF project gets CRLF in the layout, the component and the entry", () => {
    const layout =
      'import "./globals.css";\r\nexport default function L({ children }) {\r\n  return (\r\n    <html>\r\n      <body>\r\n        {children}\r\n      </body>\r\n    </html>\r\n  );\r\n}\r\n';
    const dir = project({ "package.json": pkg({ next: "16" }), "app/layout.tsx": layout });
    expect(init(dir).code).toBe(0);
    const changed = readFileSync(join(dir, "app/layout.tsx"), "utf8");
    expect(changed).toContain('import "./globals.css";\r\nimport { DevPanel } from "./dev-knobs";\r\n');
    expect(changed).toContain("        <DevPanel />\r\n      </body>");
    expect(changed).not.toMatch(BARE_LF);
    const component = readFileSync(join(dir, "app/dev-knobs.tsx"), "utf8");
    expect(component).toBe(COMPONENT.replaceAll("\n", "\r\n"));
    expect(component.startsWith('"use client";\r\n')).toBe(true);
    const vite = project({
      "package.json": pkg({ vite: "7" }),
      "index.html": '<script type="module" src="/src/main.ts"></script>',
      "src/main.ts": "start();\r\nrun()",
    });
    expect(init(vite).code).toBe(0);
    expect(readFileSync(join(vite, "src/main.ts"), "utf8")).toBe(`start();\r\nrun()\r\n${MOUNT_LINE}\r\n`);
  });

  test("a layout with `</body>` twice is left alone, with the step to do by hand", () => {
    const layout = "export default ({children}) => <html><body>{children}</body></html>;\n// note: never put scripts after </body>\n";
    const dir = project({ "package.json": pkg({ next: "16" }), "app/layout.tsx": layout });
    const { code, lines } = init(dir);
    expect(code).toBe(1);
    expect(lines).toContain(MESSAGES.next);
    expect(readFileSync(join(dir, "app/layout.tsx"), "utf8")).toBe(layout);
  });

  test("a file outside the project, by a path or a symlink, is never written", () => {
    const outside = project({ "outside/shared.ts": "start();\n", "outside2/layout.tsx": "export default ({children}) => <html><body>{children}</body></html>;\n" });
    mkdirSync(join(outside, "mono/apps/web"), { recursive: true });
    writeFileSync(join(outside, "mono/apps/web/package.json"), pkg({ vite: "7" }));
    writeFileSync(join(outside, "mono/apps/web/index.html"), '<script type="module" src="../../../outside/shared.ts"></script>');
    const web = join(outside, "mono/apps/web");
    expect(init(web)).toEqual({ code: 1, lines: ["npm i -D @vinena/knobs", MESSAGES.entry, ...TAIL] });
    expect(readFileSync(join(outside, "outside/shared.ts"), "utf8")).toBe("start();\n");
    const linked = project({ "package.json": pkg({ next: "16" }) });
    mkdirSync(join(linked, "app"));
    symlinkSync(join(outside, "outside2/layout.tsx"), join(linked, "app/layout.tsx"));
    expect(init(linked)).toEqual({ code: 1, lines: ["npm i -D @vinena/knobs", MESSAGES.next, ...TAIL] });
    expect(readFileSync(join(outside, "outside2/layout.tsx"), "utf8")).toBe("export default ({children}) => <html><body>{children}</body></html>;\n");
    expect(existsSync(join(linked, "app/dev-knobs.tsx"))).toBe(false);
  });

  test("a comment that names the package does not count as mounted", () => {
    const main = "// TODO try @vinena/knobs later\nstart();\n";
    const dir = project({ "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": main });
    expect(init(dir).lines).toContain("changed src/main.ts");
    expect(readFileSync(join(dir, "src/main.ts"), "utf8")).toBe(`${main}${MOUNT_LINE}\n`);
  });

  test("a commented-out import of the package does not count as mounted", () => {
    const main = "// import('@vinena/knobs') later\nstart();\n";
    const vite = project({ "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": main });
    expect(init(vite).lines).toContain("changed src/main.ts");
    expect(readFileSync(join(vite, "src/main.ts"), "utf8")).toBe(`${main}${MOUNT_LINE}\n`);
    const layout = '// TODO: import { DevKnobs } from "@vinena/knobs/react"\n/* import("@vinena/knobs") */\nexport default ({children}) => <html><body>{children}</body></html>;\n';
    const next = project({ "package.json": pkg({ next: "16" }), "app/layout.tsx": layout });
    expect(init(next).lines.slice(0, 3)).toEqual(["npm i -D @vinena/knobs", "created app/dev-knobs.tsx", "changed app/layout.tsx"]);
    expect(readFileSync(join(next, "app/layout.tsx"), "utf8")).toContain("<DevPanel />");
  });

  test("a string or template literal that looks like a comment does not hide a real mount", () => {
    for (const main of [
      'fetch("/api/*");\nimport("@vinena/knobs").then(({ mount }) => mount()); // */\n',
      'const docs = "https://knobs.dev";\nconst t = `\n// x`; import("@vinena/knobs").then(({ mount }) => mount());\n',
    ]) {
      const dir = project({ "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": main });
      expect(init(dir).lines).toContain("no change: src/main.ts");
      expect(readFileSync(join(dir, "src/main.ts"), "utf8")).toBe(main);
    }
  });

  test("a regex after an arrow and a self-closing JSX tag before a template do not hide a commented mount", () => {
    for (const main of [
      'const isQuote = (c: string) => /[`\'"]/.test(c);\n// import("@vinena/knobs").then(({ mount }) => mount());\nconst t = `x`;\n',
      'const A = () => <p><Logo size={24} />{`${a}/${b}`}</p>;\n// import("@vinena/knobs").then(({ mount }) => mount());\nconst t = `x`;\n',
    ]) {
      const dir = project({ "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.tsx"></script>', "src/main.tsx": main });
      expect(init(dir).lines).toContain("changed src/main.tsx");
      expect(readFileSync(join(dir, "src/main.tsx"), "utf8")).toContain(MOUNT_LINE);
    }
  });

  test("a division or a regex holding `/*` before a commented mount is not mounted", () => {
    for (const main of ['const x = a / b / c; // import("@vinena/knobs")\n', 'const x = /\\/\\*/; // import("@vinena/knobs")\n']) {
      const dir = project({ "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": main });
      expect(init(dir).lines).toContain("changed src/main.ts");
    }
  });

  test("an import line inside a template after a self-closing JSX tag is not the last import", () => {
    const layout =
      'import "./globals.css";\nexport const Badge = () => <span><Logo size={24} />{`v${major}/${minor}`}</span>;\nconst snippet = `\nimport { x } from "y";\n`;\nexport default ({ children }) => <html><body>{children}</body></html>;\n';
    expect(withPanel(layout)).toBe(
      'import "./globals.css";\nimport { DevPanel } from "./dev-knobs";\nexport const Badge = () => <span><Logo size={24} />{`v${major}/${minor}`}</span>;\nconst snippet = `\nimport { x } from "y";\n`;\nexport default ({ children }) => <html><body>{children}<DevPanel /></body></html>;\n',
    );
  });

  test("an import of the package in either quote kind counts as mounted", () => {
    for (const main of ["import { mount } from '@vinena/knobs';\nmount();\n", "import ('@vinena/knobs').then((m) => m.mount());\n"]) {
      const dir = project({ "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": main });
      expect(init(dir)).toEqual({ code: 0, lines: ["npm i -D @vinena/knobs", "no change: src/main.ts", ...TAIL] });
      expect(readFileSync(join(dir, "src/main.ts"), "utf8")).toBe(main);
    }
  });

  test("a layout that renders the user's own component that mounts knobs gets no second one", () => {
    const layout = 'import { Knobs } from "./knobs";\nexport default ({children}) => <html><body>{children}<Knobs /></body></html>;\n';
    const dir = project({
      "package.json": pkg({ next: "16" }),
      "app/knobs.tsx":
        '"use client";\nimport dynamic from "next/dynamic";\nconst K = dynamic(() => import("@vinena/knobs/react").then((m) => m.DevKnobs), { ssr: false });\nexport function Knobs() { return <K />; }\n',
      "app/layout.tsx": layout,
    });
    expect(init(dir)).toEqual({ code: 0, lines: ["npm i -D @vinena/knobs", "no change: app/layout.tsx", ...TAIL] });
    expect(readFileSync(join(dir, "app/layout.tsx"), "utf8")).toBe(layout);
    expect(existsSync(join(dir, "app/dev-knobs.tsx"))).toBe(false);
  });

  test("a layout or _app that already mounts knobs gets no component file", () => {
    const mounted = 'import { DevKnobs } from "@vinena/knobs/react";\n';
    const app = project({
      "package.json": pkg({ next: "16", "@vinena/knobs": "1" }),
      "app/layout.tsx": `${mounted}export default ({children}) => <html><body>{children}{process.env.NODE_ENV === "development" && <DevKnobs />}</body></html>;\n`,
    });
    expect(init(app).code).toBe(0);
    expect(existsSync(join(app, "app/dev-knobs.tsx"))).toBe(false);
    const pages = project({ "package.json": pkg({ next: "16" }), "pages/_app.tsx": `${mounted}export default function App() {}\n` });
    expect(init(pages)).toEqual({ code: 0, lines: ["npm i -D @vinena/knobs", "no change: pages/_app.tsx", ...TAIL] });
    expect(existsSync(join(pages, "dev-knobs.tsx"))).toBe(false);
  });

  test("a package.json with a byte order mark is read, and a broken one stops with one line", () => {
    const bom = project({ "package.json": `﻿${pkg({ next: "16" })}`, "app/layout.tsx": "export default ({children}) => <html><body>{children}</body></html>;\n" });
    expect(init(bom).lines.slice(0, 3)).toEqual(["npm i -D @vinena/knobs", "created app/dev-knobs.tsx", "changed app/layout.tsx"]);
    const broken = project({ "package.json": '{ "dependencies": ', "app/layout.tsx": "x" });
    const before = snapshot(broken);
    expect(init(broken)).toEqual({ code: 1, lines: ["error: package.json"] });
    expect(snapshot(broken)).toEqual(before);
  });

  test("a write that fails prints the path and the code, and leaves no half change", () => {
    const layout = "export default ({children}) => <html><body>{children}</body></html>;\n";
    const locked = project({ "package.json": pkg({ next: "16" }), "app/layout.tsx": layout });
    chmodSync(join(locked, "app/layout.tsx"), 0o444);
    expect(init(locked)).toEqual({ code: 1, lines: ["error: app/layout.tsx EACCES"] });
    expect(existsSync(join(locked, "app/dev-knobs.tsx"))).toBe(false);
    const shut = project({ "package.json": pkg({ next: "16" }), "app/layout.tsx": layout });
    chmodSync(join(shut, "app"), 0o555);
    try {
      expect(init(shut)).toEqual({ code: 1, lines: ["error: app/dev-knobs.tsx EACCES"] });
      expect(readFileSync(join(shut, "app/layout.tsx"), "utf8")).toBe(layout);
    } finally {
      chmodSync(join(shut, "app"), 0o755);
    }
  });

  test("a file it cannot read prints the path and the code, and writes nothing", () => {
    const dir = project({ "package.json": pkg({ next: "16" }) });
    mkdirSync(join(dir, "app/layout.tsx"), { recursive: true });
    const before = snapshot(dir);
    expect(init(dir)).toEqual({ code: 1, lines: ["error: app/layout.tsx EISDIR"] });
    expect(snapshot(dir)).toEqual(before);
  });

  test("a script in an html comment is not the entry, and the first one that exists is", () => {
    const html = '<!-- <script type="module" src="/src/old.ts"></script> -->\n<script type="module" src="/src/gone.ts"></script>\n<script type="module" src="/src/main.ts"></script>';
    const dir = project({ "package.json": pkg({ vite: "7" }), "index.html": html, "src/old.ts": "old();\n", "src/main.ts": "start();\n" });
    expect(init(dir).lines).toContain("changed src/main.ts");
    expect(readFileSync(join(dir, "src/old.ts"), "utf8")).toBe("old();\n");
    expect(moduleEntry(html, (path) => path === "src/main.ts")).toBe("src/main.ts");
  });
});

describe("the bin entry", () => {
  test("runs as a process: a dry run prints the report and exits with its code", () => {
    const dir = project({ "package.json": pkg({ vite: "7" }), "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": "start();\n" });
    const before = snapshot(dir);
    const child = Bun.spawnSync([process.execPath, join(import.meta.dir, "..", "src", "cli.ts"), "init", "--dry-run"], { cwd: dir });
    expect(child.exitCode).toBe(0);
    expect(child.stdout.toString()).toBe(`${["dry run", "npm i -D @vinena/knobs", "changed src/main.ts", ...TAIL].join("\n")}\n`);
    expect(snapshot(dir)).toEqual(before);
    const plain = project({ "index.html": "<body></body>" });
    const byHand = Bun.spawnSync([process.execPath, join(import.meta.dir, "..", "src", "cli.ts"), "init", "--dry-run"], { cwd: plain });
    expect(byHand.exitCode).toBe(1);
    expect(byHand.stdout.toString()).toBe(`${["dry run", MESSAGES.plain, ...TAIL].join("\n")}\n`);
  });
});
