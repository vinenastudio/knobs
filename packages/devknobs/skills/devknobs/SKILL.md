---
name: devknobs
description: Test a web page under different conditions with devknobs and fix what breaks. Use when an agent needs to check a page in dark mode, with reduced motion or more contrast, in another locale or right to left, with larger text, offline or on a slow connection, on another device or width, in another time zone or at another time, and then find and fix the code behind anything that looks wrong.
---

# devknobs

devknobs is a dev panel that emulates browser conditions from inside the page.
You drive it from any browser tool that can run JavaScript in the page:
Playwright `page.evaluate`, Chrome DevTools MCP `evaluate_script`, or similar.

## Before you start

devknobs must be installed in the app. See the install section of the
devknobs README (`node_modules/@vinena/knobs/README.md`).

Check that devknobs is mounted:

```js
await window.devknobs.ready();
```

Every way of mounting devknobs puts the api on `window.devknobs`: the script
tag, `mount()` and `<DevKnobs />`. Inside the width knob's frame the frame's own
copy has it too. If `window.devknobs` is undefined, devknobs is not on this
page. The script tag build keeps the api after `unmount()`, so the api alone
does not prove a mount. `ready()` does: it rejects at once with
`devknobs: not mounted` when nothing is mounted.

Then note the panel as the user left it. Keep the result in your notes, as a
later evaluate or a reload loses page variables:

```js
JSON.stringify(window.devknobs.getState().panel);
```

This note comes from the tab's `sessionStorage`, so it is the user's layout
only in a fresh tab. In a tab an earlier agent may have used, also read
`localStorage.getItem("devknobs:place")`. It holds the place the user last
gave the panel (`side`, `y`, `top`, `edge`, `tab`, `docked`). Use those fields
over the ones in the note.

## Learn the knobs

Call `describe()` first. Never guess a key or a value.

```js
window.devknobs.describe();
```

It returns one entry per knob:

- `key`: the key in a `setState` patch.
- `description`: what the knob does.
- `value`: the values it takes. `enum` lists them. `number` has `min`, `max`
  and keywords in `or`. `string` has `examples` and keywords in `or`. `object`
  lists its `fields`, and you can patch one field at a time. In `clock`, a new
  `mode` or `speed` starts from what the clock reads now, so set `mode` and
  `at` in one patch.
- `default`: the value `reset()` goes back to. `reset()` leaves `panel` as it
  is: open or closed, docked or not, handle shown or hidden.
- `reload`: what applying it takes. `none`, `frame` or `page`.

`getState()` holds some internal fields that `describe()` does not list, such
as `grabColor` and the panel's place. Do not compare the two key for key.

## Set a condition

1. Call `setState(patch)`. It is sync and returns the new state.
   A wrong key or value throws a TypeError, and then nothing changes:
   `devknobs: unknown knob <key>[.<field>]` or
   `devknobs: bad value for <key>[.<field>]: <value>`. Fix the patch from
   `describe()`. Combinations are not checked: `orientation` is dropped
   without a numeric width and height, and `posture` without a device that
   folds. Compare `getState()` with what you set.
2. Wait for it to apply:
   - `reload` is `none` or `frame`: `await window.devknobs.ready()`.
   - `reload` is `page`: the page may reload, or it may not. devknobs skips a
     reload that comes less than 5 seconds after the last one. Call
     `await window.devknobs.ready()` either way. If the page navigates
     instead, wait for the load in your browser tool and call
     `await window.devknobs.ready()` on the new page. A `ready()` from the old
     page never settles. In Playwright or a DevTools tool, the reload ends the
     evaluate with an error such as `Execution context was destroyed` or
     `Inspected target navigated or closed`. That error is the expected sign
     of the reload.

`ready()` resolves with the state once the device frame has caught up, the
pseudo text is in and the panel has finished its slide. After 10 seconds it rejects with the error
`devknobs: not settled after 10 seconds`. A rejection is not success: check the
page before you trust it.

To leave a device, call `reset()` or set
`{ device: "none", width: "full", height: "full", dpr: "system" }`.
`device: "none"` alone keeps the device's width, height and dpr, so the frame
stays up.

```js
window.devknobs.setState({ scheme: "dark", motion: "reduce" });
await window.devknobs.ready();
```

```js
window.devknobs.setState({ device: "iphone-17", locale: { lang: "ar", dir: "rtl" } });
await window.devknobs.ready();
// If the page navigates, the evaluate ends with it. Wait for the load, then on the new page:
await window.devknobs.ready();
```

## Check the page

1. Close the panel, hide its handle and unpin it, so it stays out of
   screenshots and out of the page's width, then wait for it to slide away:
   `window.devknobs.setState({ panel: { open: false, handle: false, docked: false } })`,
   then `await window.devknobs.ready()`. `reset()` keeps this. Patch only
   `open`, `docked` and `handle`. The other panel fields are the user's
   layout and settings, such as `devIcon`, the DEV ribbon on the tab's icon. `panel.handle` is your layer. The user's own "show handle" setting
   can hide the handle too, and `getState()` does not show that setting.
2. Take a screenshot, or read the DOM.
3. A numeric width or height, a device, a numeric dpr, a vision other than
   `none`, `frame: true`, or a panel pinned to its side (`panel.docked`) render
   the page in an iframe. `ua` does not bring
   the frame up. It only reloads the frame while one is up. The iframe is in
   a shadow root, so reach it through its host. Then wait for the frame's own
   `ready()`, which can come a second after the top one:

   ```js
   const frame = document
     .querySelector('[data-devknobs="viewport"]')
     ?.shadowRoot?.querySelector("iframe[data-devknobs-frame]");
   await frame?.contentWindow?.devknobs?.ready();
   frame?.contentDocument;
   ```

   Read the DOM there. The page in the frame runs its own devknobs, so call
   `grab` on `frame.contentWindow.devknobs` for elements in the frame. The top
   page's `grab` on such an element gives component names with no file or line.
   After `ready()` the frame's devknobs is there if the app mounts devknobs on
   that page.

## Find the code

For an element that looks wrong, call `grab`:

```js
const payload = await window.devknobs.grab(document.querySelector("h1"));
payload?.content;
```

`grab` takes an element, an array or a NodeList, as `querySelectorAll` gives.

`content` is one line per element: its html, the components that rendered it
and their source files with line and column. `entries[i].source?.filePath`
holds the file, relative to the app's dev server root (the vite root), not the
repo. In a monorepo, find the app first. `source` is null when devknobs cannot
find one. `source.lineNumber` and `columnNumber` are null when devknobs finds
the file but not the line, and `content` then names the file alone. Search
that file for the element's tag and class names. A line that is there points
at the element's tag in the file. Open that file and fix the code.
`entries[i].selector` finds the element in the page. It is a css selector unless it has `>>>` (a shadow root) or `>>iframe>>` (a frame) steps; then query each part in turn.

`grab` also copies the result to the clipboard. The payload comes back even
when the copy fails, as it often does in headless browsers; `copied` says
whether it reached the clipboard. `grab` skips entries that are not elements,
such as a `querySelector` that found nothing, and returns `null` when nothing
is left or the elements give nothing.

After a fix, reload the page. The knobs stay set across reloads. Call
`await window.devknobs.ready()` and check again.

## Apply the user's edits

The user can edit styles and the html in inspect's view (`⇧C`) and ask you
to put them in the code. Read them:

```js
window.devknobs.edits();
```

Each edit is plain json: `kind` (`css-value`, `css-toggle`, `css-add` or
`css-rule` for styles, or one of the html kinds below),
`target.selector` (finds the element; see `grab` for `>>>` and `>>iframe>>` steps),
`target.source` (the file and line where the element is written, when grab
finds it), `target.rule` (`selectorText`, `sheet`, `owner`, `sheetId`, `path` and `context` of the rule,
`context` being the `@media`, `@layer` or outer rule it sits in, outermost
first; left out for the element's own `style`), `property`, and `before` and `after` (the
value, `!important` and all; null where it is not set, so `after: null` means
the declaration was turned off). `edits()` lists the edits in force, each as
it was made: an edit undone drops out, and undo all or the panel's reset
empties the list. Of those,
for several edits of one property in one rule, take the first `before` and
the last `after`. Put the changes where the project writes
its styles (Tailwind classes, CSS modules, a stylesheet), not as inline
styles, unless the edit was to the element's own style.

A `css-rule` is a rule the user made in the panel: `property` is `rule`,
`after` is its selector, `target.rule.sheet` is `new rule`, and the `css-add`
edits with the same `target.rule` are its declarations. It exists only on the
page: add it where the element's styles are written (in Tailwind, a variant
such as `hover:` on the element's classes).

The html edits have `kind` `text`, `attr`, `html`, `hide`, `delete` or
`move`, and no `target.rule`. `property` is `text` (`text 2` and on for an element's later
texts), the attribute's name, `html`, `hidden` or `node`; a `delete` of an
element has `node`, of a text `text` (or `text 2` and on), and of a comment
`comment`. `before` and `after` are the text, the attribute's value or the
markup (null where it is not set: an attribute added or taken out, a node
deleted). A `hide` with `after: "hidden"` asks to hide or remove the
element, and one with `before: "hidden"` and `after: null` means it was
shown again. A `move` has `property` `node`, `before` and `after` saying in
words where the element stood and stands, and `from` and `to` saying it as
selectors read before the move: `parent` (the element it is in) and `next`
(the element it stands before, null at the end); move it in the markup the
component renders. Make each one
in the component or template that renders the element, never by patching the
DOM from a script: they were made on the live DOM, and the framework's next
render may undo them. The edits live on the page: a reload drops them, unless
the user turned on `keep edits after reload` at the top of the Elements view,
which makes them again as the page loads where it still has their targets.

To try the edits again on a fresh load, before or after they are in the code,
save the list and make it again:

```js
const list = window.devknobs.edits();
// ...reload the page, then:
const { applied, skipped } = await window.devknobs.setEdits(list);
window.devknobs.undoEdit(); // undoes the last edit in force, returns it or null
```

`setEdits` makes each edit only where its element is found by its selector
and the page still has its `before` value, through the same log as the
panel's, so the user sees them and can undo them. `skipped` lists each one not
made as `{ edit, reason }`. Once an edit is in the code, `setEdits` skips it
with `the page has another value now`: that tells you the code matches.

## Check a hover or focus state

To see or screenshot a state the pointer or the keyboard would give, force it:

```js
window.devknobs.forceState(".cta", ["hover"]); // or "focus", "focus-visible", "active", "focus-within"
// screenshot, then:
window.devknobs.forceState(null);
```

It takes an element or a selector, returns the states forced, and is no edit.
`reset()` does not clear it: call `forceState(null)` before you go on to the
next condition and before `reset()` when you finish.
It is emulated: a stylesheet from another origin is not seen, and a page rule
with `:not(:hover)` still draws.

## Loop over conditions

```js
const conditions = [
  { scheme: "dark" },
  { motion: "reduce" },
  { contrast: "more" },
  { text: 24 },
  { spacing: true },
  { network: { online: "offline" } },
  { timeZone: "Asia/Kathmandu" },
  { width: 390 },
];
```

For each condition:

1. `window.devknobs.reset()`.
2. `window.devknobs.setState(condition)`. The panel stays as you set it in
   "Check the page".
3. Wait as in "Set a condition".
4. Screenshot or read the DOM. Note what breaks.
5. `grab` the broken elements, fix the code, check again.

Test locale apart, as it can reload the page: `{ locale: { lang: "ar" } }`. The
`reset()` after it can reload the page too, so wait for the load. Also try
`{ pseudo: true }` to find text that is cut off or not translated. It also
changes data values, such as numbers and names. That is not a bug.

## Finish

Put the knobs back, and the panel as you noted it at the start:

```js
window.devknobs.forceState(null); // a state you forced; reset() leaves it
window.devknobs.reset();
window.devknobs.setState({ panel: NOTED_PANEL }); // the panel json you noted
await window.devknobs.ready();
```

The knobs are kept in `sessionStorage` and stay set across reloads in the tab
until a reset. The panel's place, docked or not with it, is also kept in
`localStorage` under `devknobs:place`, which every tab of the origin reads
when it opens. Your `setState` does not write it, but the user's next drag
or pin in this tab does, with what you left. So put the panel back.
