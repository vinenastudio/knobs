---
title: start
description: Install @vinena/knobs, mount it in development only, and load the early script where the page needs it.
order: 1
---

knobs is a dev-only panel for flipping browser preferences from inside the page. one script tag and the knobs are there. no css to add, no code to change. zero runtime dependencies.

## two ways to use it

- **the npm package, in your app.** you add `@vinena/knobs` to the project and mount it in development only. the knobs are emulated inside the page, in any browser. the rest of this page sets it up.
- **the chrome extension, on any site.** it puts the same panel on every page you open, with some knobs set for real by the browser, no code changed. see [chrome extension](/docs/extension).

## install

with an ai agent: paste this setup prompt into claude code, codex or cursor, and it installs @vinena/knobs and mounts it in development only. it is the copy installation prompt button on the home page and at the top of /docs/start too.

```
Read https://knobs.dev/llms-full.txt first: it is the full knobs reference. Then install @vinena/knobs in this project. It is a dev-only panel that emulates browser preferences from inside the page.

1. Detect the package manager from the lockfile and add @vinena/knobs as a dev dependency (npm i -D @vinena/knobs, or the pnpm, yarn or bun equivalent).
2. Mount it once, on the client, in development only:
- Next.js: make a small client component (the file starts with "use client"). In it, import dynamic from "next/dynamic", then const Knobs = process.env.NODE_ENV === "development" ? dynamic(() => import("@vinena/knobs/react").then((m) => m.Knobs), { ssr: false }) : null; and render {Knobs && <Knobs />}. Render that component once in app/layout (App Router) or pages/_app (Pages Router).
- Everything else with a bundler (Vite, TanStack Start, React Router, SvelteKit): call if (import.meta.env.DEV) import("@vinena/knobs").then(({ mount }) => mount()); in the client entry, or in a mount effect of the root component in an SSR app. Use the bundler's own dev flag where import.meta.env.DEV does not exist.
- A plain page with no bundler: skip the npm install and add <script src="//unpkg.com/@vinena/knobs/dist/index.global.js"></script> to the page. It mounts itself. Keep it out of the deployed page.
3. Keep knobs out of production builds. A static import stays in the bundle even behind a dev check, so gate the import itself as above. If the project has a build script, run it and check that the output has no knobs.
4. If the app reads media queries, the time or the user agent while it boots, or renders with React, add the early script as the first element in <head>, in development only: <script src="//unpkg.com/@vinena/knobs/dist/early.global.js"></script>
5. Change nothing else in the project for the setup.
6. Open the app in your browser tool, such as Playwright or the Chrome DevTools MCP, and drive window.knobs. For each check, call window.knobs.reset(), then window.knobs.setState(), then await window.knobs.ready(). Check a phone ({ device: "iphone-17" }), dark mode ({ scheme: "dark" }) and a right-to-left language ({ locale: { lang: "ar", dir: "rtl" } }). The locale knob can reload the page, so wait for the load. window.knobs.grab() what breaks, fix it and check again. Then call window.knobs.reset().
7. Then tell me what you changed, what you fixed and how to open the panel: press Shift+K or click the handle on the right edge of the window. In the open panel, / searches the knobs. Shift+G grabs an element.
```

or by hand:

```sh
npm i -D @vinena/knobs
```

then add the mount line with one command, in a next or vite project. it changes the code for development only:

```sh
npx @vinena/knobs init
```

## usage

three ways in. all of them are meant for dev only, so gate them yourself.

script tag:

```html
<script src="//unpkg.com/@vinena/knobs/dist/index.global.js"></script>
```

the global build mounts itself on load and puts the api on `window.knobs`.

import:

```js
import { mount } from '@vinena/knobs';

if (import.meta.env.DEV) mount();
```

react, one element:

```jsx
import { Knobs } from '@vinena/knobs/react';

export function Root({ children }) {
  return (
    <>
      {process.env.NODE_ENV === 'development' && <Knobs />}
      {children}
    </>
  );
}
```

`Knobs` is a client component. it mounts the knobs on the first effect, unmounts them on cleanup, and renders nothing.

a static import stays in the production bundle even behind that check, because the bundler still has to keep the module. in next.js, gate the import itself:

```jsx
'use client';

import dynamic from 'next/dynamic';

const Knobs =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('@vinena/knobs/react').then((m) => m.Knobs), {
        ssr: false,
      })
    : null;

export function DevPanel() {
  return Knobs && <Knobs />;
}

// render <DevPanel /> once in app/layout or pages/_app
```

once it is mounted, press `⇧K` or click the handle on the right edge of the window to open the panel. see [the panel](/docs/panel).

## the api

`mount(options?)`, `unmount()`, `getState()`, `setState(patch)`, `reset()`, `replay()`, `grab(elements, options?)`, `describe()`, `ready()`, `PRESETS`. `replay()` is what the panel calls replay animations. `describe()` and `ready()` are for agents, see [agents](/docs/agents).

```js
setState({ scheme: 'dark' });
setState({ geo: { preset: 'tokyo' } });
setState({ geo: { error: 'denied' } });
setState({ timeZone: 'Asia/Kathmandu' });
setState({ clock: { mode: 'frozen', at: Date.parse('2026-12-24T18:00') } });
setState({ clock: { mode: 'offset', speed: 60 } });
setState({ network: { online: 'offline' } });
setState({ device: 'iphone-16-pro', orientation: 'landscape' });
setState({ width: 390, height: 844 });
setState({ locale: { lang: 'ar' } });
setState({ ua: { preset: 'iphone-safari' } });
```

state lives in `sessionStorage` under `devknobs` and `knobs`, so it survives reloads and dies with the tab. pass `mount({ persist: false })` to keep it in memory.

## options

`mount()` and `<Knobs />` take the same options:

| option      | default                           | what it does                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hotkey`    | `k`                               | letter that with shift toggles the panel. a key set in the panel wins, see [shortcuts](/docs/panel#shortcuts)                                                                                                                                                                                                                                                                                |
| `open`      | the stored state, closed at first | start the panel open or closed                                                                                                                                                                                                                                                                                                                                                               |
| `persist`   | `true`                            | keep the knobs in `sessionStorage`                                                                                                                                                                                                                                                                                                                                                           |
| `state`     | none                              | knobs to apply on top of the stored state                                                                                                                                                                                                                                                                                                                                                    |
| `grab`      | `true`                            | press a key to grab elements, see [grab](/docs/grab)                                                                                                                                                                                                                                                                                                                                         |
| `grabKey`   | `shift+g`                         | the key that grabs, such as `alt+shift+g`. a key set in the panel wins                                                                                                                                                                                                                                                                                                                       |
| `grabColor` | the stored one, `auto` at first   | the color of grab's boxes: `auto`, `blue`, `green`, `pink`, `orange`, `purple`, `cyan`, or a hex of your own such as `#ff8c00`                                                                                                                                                                                                                                                               |
| `handle`    | `true`                            | show the handle on the window's edge while the panel is closed. a choice made in the panel's settings wins, see [settings](/docs/panel#settings)                                                                                                                                                                                                                                             |
| `native`    | none                              | a host that sets knobs for real, such as a browser extension. see [the native option](#the-native-option) below                                                                                                                                                                                                                                                                              |
| `host`      | `false`                           | mount as the page's host, as the knobs extension does. a copy the page mounts after it puts up no panel of its own: it hands over its `hotkey`, `grabKey`, `grab`, `open` and `grabColor`, its api calls, such as `setState`, go to the host, and its `unmount()` leaves the host's panel. without a host, a second copy, such as a dev server's hot update loads, takes over from the first |

### the native option

`native` is for a host that sets knobs for real, such as a browser extension: `{ text, offline, media, viewport, ua }`, each a function. a knob it has a function for leaves the page alone and goes to it, with each new value:

- `text` gets the size in px or `system`.
- `offline` gets a boolean.
- `media` gets the `scheme`, `motion`, `contrast` and `transparency`.
- `viewport` gets `{ width, height, dpr, mobile, touch, touchPointer }` (a side or the ratio `null` for the window's own) for a size or a device with nothing drawn around the page, in place of the frame, and `null` otherwise: a device's body or browser, a foldable, a vision filter, a zoom, the frame knob or a docked panel keep the frame as ever.
- `ua` gets the browser the page's requests go out as, `{ userAgent, platform, mobile, brands, uaPlatform, hints }` from the ua knob or a device's browser, or `null` for the browser's own, with the switch below off too. the page's `navigator` keeps knobs' patches either way, and a promise it returns holds the frame's next load until it settles, so the server sees the new one.

unmount hands each its default. such a host hides the user's own scheme and motion from the panel as well, so it reads them where its knobs do not reach and passes them to `setSystemMedia({ scheme, motion })` (`light` or `dark`, `reduce` or `no-preference`), which the panel and grab then take in place of their media queries; `null` goes back to those.

with a `setting`, `{ label, hint, change }`, the panel's settings show a switch under the handle's, on at first, that turns the driver off and on, every knob kept: off, the driver is handed its defaults and knobs emulates its knobs in the page, as with no driver. `change(on)` hears the user's choice for the host to keep, and `setNative(on, note)` hands one back, `note` showing in place of the hint (such as why it went off) until `null`.

`refused(url)` is asked each time the frame's page refuses to load, with the address the frame was given, and resolves to `{ why, details, retry }` or `null`: `why` is a line under the notice, `details` what its "copy details" button copies, and `retry`, `{ label, run, now }`, a button that runs `run` and then loads the frame again, at once with no press when `now` is true.

`framed(open)` hears the frame open, before its first load, and go; a promise it returns as the frame opens holds that load until it settles.

## early script

optional. a page that reads a media query or the time while it boots, before knobs mounts (a theme script, a module that checks `prefers-reduced-motion` once, a store that stamps `Date.now()`), only sees the knob if the patch is already in place. put the early script first in `<head>`:

```html
<script src="//unpkg.com/@vinena/knobs/dist/early.global.js"></script>
```

it is also `@vinena/knobs/early` in the package. what it does:

- it applies the stored scheme, motion, contrast and transparency on the spot, and in a device's frame its pointer and hover, with no panel: the `matchMedia` and `matches` patches, `color-scheme` on `<html>`, and the stylesheet rewrite as sheets arrive.
- it sets the stored clock the same way, through `Date` and `Temporal.Now`, and the stored user agent on `navigator`, so a page that sniffs it while it boots sees the preset.
- it puts a React devtools hook in place for [grab](/docs/grab), when the page has none, so React reports to it from its first render.
- before all of that it sets what the [storage presets](/docs/requests-and-storage#presets) marked apply on load hold, so the page's own scripts start with them.

the full script, however it is loaded, takes those patches over when it mounts instead of patching on top, and lists made in between still get their change events. a `Date` the page kept in between follows the clock still. it covers the media knobs, the clock and the user agent only, and since it reads the stored state, it follows the knobs from the next load on. inside a frame that gets the scheme natively, it leaves the scheme to the browser, as the full script does.

when the stored knobs put the page in a frame, the early script also hides the page under the frame's mat from the first paint, so a reload never shows it full width while knobs loads. the frame as the last page left it (the mat, the case and the phone's browser, its screen blank in the page's color) is kept in `sessionStorage` as the page unloads, and put back as it was, when the device, the way it is held and the window's size are the same. otherwise the bare mat stands in. the full script takes it over without a jump, and the screen shows the page loading as Safari does a reload. without knobs after 3 seconds, the page shows again.
