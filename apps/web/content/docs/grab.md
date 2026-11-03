---
title: grab and inspect
meta_title: Grab and inspect elements for a coding agent with devknobs
description: Grab any element on the page and copy its html, the components that rendered it and their source files for a coding agent, or inspect its box and css.
order: 5
updated: 2026-11-03
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
card shows the color, font, contrast and spacing.

click a value to edit it, the box at a line's start turns it off and on, and
`+ add property` adds one. the changes at the foot list each edit as `-` and
`+` lines: `Z` undoes and `⇧Z` (`Shift Z` off a Mac) redoes while the focus
is in the view and not in a field (⌘Z and Ctrl Z do not), and `copy prompt
for agent` copies a prompt that asks your agent to put them in the code.

the DOM tree can be edited too: double-click a text or an attribute to edit
it, and on the selected line `a` adds an attribute, `F2` edits it as html,
`h` hides it and Delete deletes it, or use the bar under the tree. those
edits go into the same changes, and the prompt asks your agent to change the
component, as a re-render may undo an edit of the DOM. `<html>`, `<head>`
and `<body>` and devknobs' own nodes and attributes cannot be replaced,
hidden or deleted.
