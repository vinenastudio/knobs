# @vinena/knobs

a dev-only panel for flipping browser preferences from inside the page. one
script tag and the knobs are there. no css to add, no code to change. zero
runtime dependencies.

## install

with an ai agent: paste this setup prompt into claude code, codex or cursor, and
it installs @vinena/knobs and mounts it in development only. it is the copy setup
prompt button on https://knobs.dev too.

<!-- the same text is the install_prompt message in apps/web/messages/en.json and the setup prompt in apps/web/content/reference/start.md; change all three together. -->

```
Read https://knobs.dev/llms-full.txt first: it is the full devknobs reference. Then install @vinena/knobs in this project. It is a dev-only panel that emulates browser preferences from inside the page.

1. Detect the package manager from the lockfile and add @vinena/knobs as a dev dependency (npm i -D @vinena/knobs, or the pnpm, yarn or bun equivalent).
2. Mount it once, on the client, in development only:
- Next.js: make a small client component (the file starts with "use client"). In it, import dynamic from "next/dynamic", then const DevKnobs = process.env.NODE_ENV === "development" ? dynamic(() => import("@vinena/knobs/react").then((m) => m.DevKnobs), { ssr: false }) : null; and render {DevKnobs && <DevKnobs />}. Render that component once in app/layout (App Router) or pages/_app (Pages Router).
- Everything else with a bundler (Vite, TanStack Start, React Router, SvelteKit): call if (import.meta.env.DEV) import("@vinena/knobs").then(({ mount }) => mount()); in the client entry, or in a mount effect of the root component in an SSR app. Use the bundler's own dev flag where import.meta.env.DEV does not exist.
- A plain page with no bundler: skip the npm install and add <script src="//unpkg.com/@vinena/knobs/dist/index.global.js"></script> to the page. It mounts itself. Keep it out of the deployed page.
3. Keep devknobs out of production builds. A static import stays in the bundle even behind a dev check, so gate the import itself as above. If the project has a build script, run it and check that the output has no devknobs.
4. If the app reads media queries, the time or the user agent while it boots, or renders with React, add the early script as the first element in <head>, in development only: <script src="//unpkg.com/@vinena/knobs/dist/early.global.js"></script>
5. Change nothing else in the project for the setup.
6. Open the app in your browser tool, such as Playwright or the Chrome DevTools MCP, and drive window.devknobs. For each check, call window.devknobs.reset(), then window.devknobs.setState(), then await window.devknobs.ready(). Check a phone ({ device: "iphone-17" }), dark mode ({ scheme: "dark" }) and a right-to-left language ({ locale: { lang: "ar", dir: "rtl" } }). The locale knob can reload the page, so wait for the load. window.devknobs.grab() what breaks, fix it and check again. Then call window.devknobs.reset().
7. Then tell me what you changed, what you fixed and how to open the panel: press Shift+K or click the handle on the right edge of the window. In the open panel, / searches the knobs. Shift+G grabs an element.
```

or by hand:

```
npm i -D @vinena/knobs
```

## usage

all of it is for dev only, so gate it yourself:

```js
import { mount } from "@vinena/knobs";

if (import.meta.env.DEV) mount();
```

or with no bundler, a script tag that mounts itself:

```html
<script src="//unpkg.com/@vinena/knobs/dist/index.global.js"></script>
```

press `⇧K`, or click the handle on the right edge of the window, to open the
panel. react, next.js and the early script are in the docs.

on a local host (localhost, `*.localhost`, `*.local`, `0.0.0.0`, a loopback
or private network address, IPv6 local ones too) the tab's icon gets a yellow
`DEV` ribbon, drawn from the site's own icon, so a dev tab never looks like
production. an icon from another origin that does not allow it (CORS) keeps
its own picture. the dev tab icon switch in the panel's settings turns it off,
or on for any host.

## docs

- [start](https://knobs.dev/docs/start): install @vinena/knobs and mount it in
  development only
- [the panel](https://knobs.dev/docs/panel): open it, move it, search it, pin
  it and set its keys
- [knobs](https://knobs.dev/docs/knobs): every knob devknobs has and what it
  does to the page
- [devices](https://knobs.dev/docs/devices): phone, tablet and laptop presets,
  with mocks, bezels and the phone's browser drawn around the page
- [grab and inspect](https://knobs.dev/docs/grab): grab an element for a coding
  agent, or inspect its box and css in the panel
- [requests and storage](https://knobs.dev/docs/requests-and-storage): see
  every request the page makes, and read, edit and save what it keeps
- [agents](https://knobs.dev/docs/agents): let a coding agent drive the knobs,
  wait for the page, grab what broke and fix it
- [chrome extension](https://knobs.dev/docs/extension): the panel on any site,
  with some knobs set for real by Chrome
- [limits and faq](https://knobs.dev/docs/limits): what devknobs cannot fake
  from inside a page, and common questions
- [privacy](https://knobs.dev/docs/privacy): what the npm package, the
  extension and knobs.dev keep, and what they send

the full reference, every detail in one file, is at
<https://knobs.dev/llms-full.txt>.

## development

to try a local build in an app:

```
bun run link ../my-app
bun run unlink ../my-app
```

a relative path is from the devknobs folder; absolute and `~` paths work too.
the app may use any package manager: a pnpm app's link into its store is kept
and put back as it was.

`link` builds, then copies the package into the app's `node_modules/@vinena/knobs`
and keeps the installed one beside it for `unlink` to put back. it is a copy,
not a symlink: Turbopack refuses a package linked from outside the app, and
other bundlers treat the real path as app source. restart the app's dev server
after each.

the controls for tuning the iphone duo fold's look by hand, `src/engine/foldtune.ts`,
are for development and never in the package: the build passes
`--define DEVKNOBS_TUNE=false` to every bundle and `scripts/tunefree.ts` fails
a build that has any of them. an app gets them by loading devknobs from source,
a bundler alias from `@vinena/knobs` to this repo's `src`, where the constant is not
defined and the table is on `window` under `Symbol.for("devknobs.foldtune")`.
an app that builds from source for production defines `DEVKNOBS_TUNE` false too.

## license

MIT, except the bezel images in `dist/bezels`. bippy and the code adapted
from react-grab are MIT too, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for them and for the images' own terms.
