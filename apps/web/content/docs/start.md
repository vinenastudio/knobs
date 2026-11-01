---
title: start
meta_title: Install devknobs: set up the knobs dev panel in your app
description: Install @vinena/knobs from npm, mount the devknobs panel in development only, and load the early script for pages that read media queries or the time on load.
order: 1
updated: 2026-10-25
---

devknobs is a dev-only panel for flipping browser preferences from inside the page. one script tag and the knobs are there. no css to add, no code to change.

want it on any site with no install? use the [chrome extension](/docs/extension).

## install

```sh
npm i -D @vinena/knobs
```

or let your agent do it: the copy setup prompt button on the home page gives claude code, codex or cursor the steps to install it and mount it in development only.

## mount it

pick one. all of them are for dev only, so gate them yourself.

a plain page, no bundler. it mounts itself:

```html
<script src="//unpkg.com/@vinena/knobs/dist/index.global.js"></script>
```

with a bundler:

```js
if (import.meta.env.DEV) import('@vinena/knobs').then(({ mount }) => mount());
```

in react, render `<DevKnobs />` from `@vinena/knobs/react` once, in development only. it renders nothing and mounts the knobs on its first effect. a static import stays in the production bundle even behind a dev check, so in next.js load it with `dynamic()` behind the check.

## open it

press `⇧K` or click the handle on the right edge of the window. in the open panel, `/` searches the knobs and `⇧G` grabs an element. see [the panel](/docs/panel).

the knobs live in `sessionStorage`, so they survive reloads and go away with the tab.

## early script

a page that reads a media query, the time or the user agent while it boots, before devknobs mounts, only sees the knob if the patch is already in place. put this first in `<head>`, in development only:

```html
<script src="//unpkg.com/@vinena/knobs/dist/early.global.js"></script>
```

## from code

`mount()` and `<DevKnobs />` take options such as `hotkey`, `open` and `persist`. the api sets knobs too: `setState({ scheme: 'dark' })`, `reset()`, `getState()`. agents get `describe()` and `ready()`, see [agents](/docs/agents).
