---
title: grab and inspect
meta_title: Grab and inspect elements for a coding agent with devknobs
description: Grab any element on the page and copy its html, the components that rendered it and their source files for a coding agent, or inspect its box and css.
order: 5
updated: 2026-10-25
---

## grab

press `⇧G` (`Shift G` off a Mac), hover an element and click it. its html,
the components that rendered it and where they live go on the clipboard:

```
[<button type="button" data-testid="save">Save</button> in SaveButton (at src/App.jsx:5:5) in App (at src/App.jsx:28:7)]
```

paste that into your agent and it can find the code.

- shift and a click gather several elements, one line each.
- the arrows move to the parent, a child or a sibling. enter or `c` copies.
- escape or `⇧G` again turns grab off.

for a file, a line and a column on every component, React needs a devtools
hook from its first render: the React devtools extension, or the
[early script](/docs/start).

## change the key

```js
mount({ grabKey: 'alt+shift+g' });
```

`grab: false` leaves grab out. `grab(elements)` copies elements from code.

## coming from react-grab

devknobs has the same grab, the same line format and the same clipboard
type. remove `react-grab`, mount devknobs, and pass `grabKey: "meta+c"`
(`"ctrl+c"` off a Mac) to keep react-grab's key.

## inspect

press `⇧C` (`Shift C` off a Mac) and click an element to see its css in the
panel, as the browser's Elements panel shows it:

- the DOM tree on top, the element selected, with its breadcrumbs under it
- its box: margin, border, padding and content, with their sizes
- its styles, in `simple` mode (what applies) or `advanced` (every rule, in
  cascade order)

while you pick, the box is drawn on the page in the browser's colors, and a
card shows the color, font, contrast and spacing. inspect is read only.
