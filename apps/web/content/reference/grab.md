---
title: grab and inspect
description: Grab an element for a coding agent with its html, components and source places, or inspect its box and css in the panel.
order: 5
---

## grab

press `⇧G` (`Shift G` off a Mac) to grab an element for a coding agent. hover
it, click it, and its html, the components that rendered it and where they live
are on the clipboard, one line per element:

```
[<button type="button" data-testid="save">Save</button> in SaveButton (at src/App.jsx:5:5) in App (at src/App.jsx:28:7)]
```

paste that into the agent and it can find the code. the clipboard also carries
the same context as json, under `application/x-devknobs-grab` and react-grab's
own `application/x-react-grab`.

grab turns on with the press, and stays on until a copy, escape or `⇧G` again.
holding the key down does not turn it off. in a field of the page `⇧G` types a
capital and grab stays off, and in the panel's search it is grab's. a grab key
with meta, ctrl or alt, such as `alt+shift+g` or a copy shortcut like
`meta+c`, turns on once it is held for 100ms, and a quick press of a copy
shortcut is still a copy. the hold is 500ms while a field has
the focus and 700ms while text is selected, and a key that copied something
waits for the key to repeat, or to be let go after 200ms. grab then stays on
until a copy or escape. the search finds it too:
`grab` or `pick`. grab is an action, not a row: it is never
listed, and never kept, so a reload starts with it off.

while it is on:

- the element under the pointer gets a box and a label with its tag and its
  component, and the cursor is a crosshair. devknobs' own panel and frame are
  passed over, open shadow roots are reached into, and so are the children a
  hit test passes over: those that take no pointer events, or sit under a clear
  layer or a pseudo element stretched over a card.
- a click copies the element, and grab ends. the page's own click, mouse and
  pointer handlers never hear of it, and its hover handlers neither.
- shift and a click gather elements, lighter boxes, and a second one takes one
  back out. letting go of shift, or a click without it, copies them all, one
  line each.
- up goes to the parent, down back the way it came or to the first child, left
  and right (and tab, shift-tab) to the previous and the next element, siblings
  first, then the sibling of the nearest parent that has one. enter or `c`
  copies.
- a check and "Copied" show by the element for a moment, the box still on it.

the context of the element under the pointer is worked out while the pointer
rests there, so a click copies it whole, inside the click, as Safari wants.
where it is not ready yet, the click copies it without lines and columns, by
component names, and the rest is worked out for the next copy.

grab runs in the page that owns React. with the width knob's frame up, the
page above hands grab to the frame, and the box and the copy happen there.
escape in the frame ends it.

pass `grabKey: "alt+shift+g"` for another key, or `grab: false` to leave it out.
`grab(elements)` copies elements from code and resolves with the payload, its
`content` and `entries`. it comes back even when the copy fails, with `copied`
false, and is null only when the elements give nothing. the overlay and the
context load the first time grab is used.

for the full owner stack, with a file, a line and a column for each component,
React has to report to a devtools hook from its first render. the React
devtools extension has one. without it, load the [early script](/docs/start#early-script) first, which puts one in place. with neither, grab names the components it
finds on the element and falls back to a selector. the line shows a selector
only when it is built from a test id, a label, a stable id or another meaningful
attribute (href, src, role, name, title, alt); each entry's
`selector` has one for the element in any case.

the copied line keeps to the app's own code: the component the element is
written in, at the line and column of its jsx, then the components that
rendered it, three at most, with paths from the project's root. a library's
frames, React's and nameless ones stay out, a place shows once, and class
names a tool generated (StyleX, CSS modules, emotion, styled-components) are
dropped. where a dev
server's source map has no place for an element, as a route split from its
file can, the place is looked up in the source the map carries.

grab is adapted from [react-grab](https://github.com/aidenybai/react-grab) and
reads React's internals through [bippy](https://github.com/aidenybai/bippy),
both by Aiden Bai and MIT, see
[THIRD_PARTY_NOTICES.md](https://github.com/vinenastudio/knobs/blob/main/packages/devknobs/THIRD_PARTY_NOTICES.md).

## migrating from react-grab

devknobs covers it: the same grab, the same line format, the same
clipboard type. remove the `react-grab` script or package, and mount devknobs.
pass `grabKey: "meta+c"` (`"ctrl+c"` off a Mac) to keep react-grab's key.

## inspect

press `⇧C` (`Shift C` off a Mac) to see the css of an element. it picks as
grab does, with the same box, arrows and escape, and its label says `styles`
before the element. a click copies nothing: the element's styles open in the
panel, in place of the rows, and the panel grows wider for them. drag its
edge for another width.

picking is a mode, as in the browsers' own tools. a click picks the element
and ends the picking: nothing is left drawn on the page, and the page takes
clicks again. the element stays in the styles view. to pick another, press
the select button at the left of the view's bar, the dashed square with a pointer, or
`⇧C` again. the button is pressed while the picking is on, and `⇧C` while
picking stops it. escape ends the picking and keeps the element shown, the
next escape clears the filter if it has text, and the next goes back to the
rows, as the back button on top does. going back ends the picking and keeps
the element: inspect's row says its name, and opens the view on it again
without picking. with no element, the row starts the picking. `⇧E` opens the
view without picking too, on the element held, else on the page's body, and
opens the panel for it where it is closed. pressed again while the view shows,
it closes the view. the row says
`picking` while the mode is on, and `off` with nothing picked.

the view points at the page only while the pointer is on what stands for an
element: a crumb, the box's diagram, or the name in the view's head box that
element on the page, and the box goes when the pointer leaves. an element
that left the page is said so, in a line you press to pick another. with no
element the view has no bar, and its one line starts the picking. the
search finds inspect as `inspect`, `styles` or `css`, the footer has its
key, and the shortcuts in the settings set another. grab and inspect are
never on together: starting one ends the other. while grab is on `c` is
grab's copy.

while inspect is on, the element under the pointer shows its box as the
browsers' own tools draw it: the content in blue, the padding in green, the
border in yellow and the margin in orange, see-through, under the box's own
line. a negative margin makes no area on its side. an element in several
pieces, as a link over two lines is, is drawn by its bounding box, and so is
one a transform turns or scales, unless the browser has `getBoxQuads`, which
gives its own corners. an element with `display: contents` or of no size has
no box, only its label. an element the view points at is drawn the same way,
with no label. grab draws none of this.

the label by the box is a small card in inspect. its first line is the
element and its size. under it, once the pointer rests, only what applies:

- `color` and `background`, each with a swatch, as a hex or as `rgb()` with
  its alpha. where the element has no background of its own, it is the one
  that shows through from an ancestor, said quietly
- `font`: the family, then the size over the line height, the weight, and
  the letter spacing where it is not `normal`
- `contrast`: the wcag ratio of the text on its background, with a check
  where it meets level AA at the text's size and weight, or a cross
- `margin` and `padding`, top, right, bottom, left, where any side has some

the color, the font and the contrast are for an element with text of its
own. what the `font` row can know: it is the first family of the computed
`font-family` that `document.fonts.check` says is there, or the first
generic one such as `sans-serif`. for a web font the answer is exact: it is
there once it has loaded. for a family the page did not load, most browsers answer yes whether
the system has it or not, so the row trusts the name. and no browser tells
a page which font a glyph really fell back to, so text that mixes scripts
may be drawn in more fonts than the one named. the background is the
`background-color` only: an image or a gradient behind the text is not seen,
and the contrast is then against the color under it.

the styles start with the element's box, under `box`, which folds away
and stays the way you leave it: the margin, the border, the padding and the
content one inside the other, each with the length of its four sides in css
px, a dash for 0, the content with its width by its height, and around them
the offsets of a positioned element. the pointer on the box draws the
element's on the page, and on one area that one alone. where the panel is too narrow for the
lengths, they leave the areas, and those of the area the pointer or the
focus is on stand in a line under them. under that are the element's
`box-sizing` and `display`, and its `position` where it is not `static`. the
box is read again with the styles, and when the element changes size.

the view has two modes, set by the control beside the filter, and the one
you pick is kept. `simple`, the one it starts in, lists only the styles that
apply to the element, by what they do, with what it inherits folded under
them, and after a value that reads a custom property what it comes to.
`advanced` shows, in the order the cascade settles them:

- the element's `style` attribute, as `element.style`
- every rule that reaches it, the strongest first, with the selectors of a
  list that do not match muted, the `@layer`, `@media`, `@supports` and
  `@container` it sits in above it, and the stylesheet's file after it
- declarations another one overrides, struck through
- the rules of its `::before` and `::after`
- what each ancestor hands down, under `inherited from` and its name

a color has a swatch before it. in both modes a property's name has a color
of its own, the one the names in a request's headers and a cookie's fields
have, and every custom property a value reads through `var()` is a piece you
can rest the pointer on or reach with the tab key, as is the name of a
`--custom` declaration: the tooltip says what the element sees for it right
then, with a swatch for a color and under it the selector that sets it, or
`not set` and what its fallback comes to. in `advanced` a click on one goes to
the block that sets it, and no click copies. the crumbs under the tree are the element's ancestors, each a
click away, and the filter keeps the declarations that have its text in
their name or value. the view reads the styles again when the element or an
ancestor changes, when a stylesheet in the head does, when the window is
resized and when a knob moves. with the width knob's frame up, inspect picks
in the frame and the styles show in the panel. what a knob of devknobs
writes on `<html>`, the root size of the text size knob and the
`color-scheme` of the scheme knob, is left out.

### the elements tree

the view is laid out as the browsers' own Elements panel: the DOM tree on
top, the element's breadcrumbs under it, and the styles under those. the
tree is the page's document, or the frame's page with the width knob's frame
up, from `<!DOCTYPE html>` and `<html>` down, with the element picked
selected and every node on the way to it open. each line is a node as the
Elements panel writes it: `<tag attr="value">` in its colors, a triangle on
what opens, `<tag>…</tag>` for one that is closed, an element's one short
text inside its line, other text in quotes, `<!-- comments -->`,
`#shadow-root (open)` for an open shadow root, and `::marker`, `::before`
and `::after` where they have content. an open element ends on a line of its
own, `</tag>`. long values and texts are cut short with `…`. past 500
children a line says `Show all nodes (N more)`. devknobs' own nodes, its
panel, boxes, frame and styles, are never in it.

the pointer on a line boxes its element on the page, margin and padding as
the picking draws them. a click selects a line and the styles follow it, and
a pick on the page or a crumb selects its element in the tree. the arrows
move as in the Elements panel: up and down a line, right opens a line or goes
into it, left closes it or goes to its parent, Home and End to the ends. the
selected line ends with `== $0`, and `$0` on the page's window is that node
while the view is open, unless the page has a `$0` of its own. its `copy`,
or cmd or ctrl and c in the tree, copies the node's outer html, as Copy
element does. the tree follows the page as it changes, and a node that
changed lights for a moment. drag the tree's bottom corner for more or less
of it.

### edit the html

the tree can be edited as in the browsers' own tools, and each edit goes on
the page at once, into the same changes as the style edits:

- a double-click on a line's text, or ↩ on its line, makes the text a
  field. ↩ puts it on the page and esc leaves it. only that text changes:
  the element's other children stay. an empty text is refused
- a double-click on an attribute makes it a field with `name="value"`, as in
  the tag, a `"` in the value written `&quot;` and a `&` as `&amp;`. change
  the value or the name, write several `name="value"` pairs in one field, or
  clear the field to take the attribute out. `class` is edited like any
  other attribute
- a text or a value with line breaks, as in a `<pre>` or an svg path, opens
  in a field that keeps them, where ↩ breaks the line, and `⇧↩`
  (`Shift Enter` off a Mac) or its `apply` button puts it on the page
- `a` on the selected line adds an attribute, in a field before the tag's end
- `F2` edits the element as html: an editor with its outer html, in the
  panel's monospace, its lines numbered and its tags, attributes, values and
  comments colored. ↩ breaks the line with the line's indent, one level more
  after an opening tag, and between a tag and its end tag puts the end on a
  line of its own. `>` after `<div` writes `</div>` after the caret (not for
  a void element such as `<img>` or `<br>`), and `"` after `=` in a tag
  writes the closing quote too, which typing it steps over. the grip under
  the editor drags its height, and `expand` makes it as tall as the panel
  (`shrink` makes it as it was); both are kept for the next time. `⇧↩`
  (`Shift Enter` off a Mac), its `apply` button, or a click elsewhere puts the
  new html in the element's place and selects it; esc leaves it. html with no element in it, or with devknobs' own
  `data-devknobs` attributes, is refused: applying it with `⇧↩` or the
  button turns the field red and keeps it open, while a click elsewhere
  closes it without the edit. undo puts the very element back, unless the
  page moved the new nodes since
- `h` hides the selected element and all in it, and shows it again:
  `visibility: hidden` through an attribute of devknobs', so the page's own
  `style` stays as it is. its line goes faint
- Delete or Backspace deletes the selected node, and the line after it is
  selected. undo puts it back where it stood
- `⇧↑` and `⇧↓` (`Shift Up` and `Shift Down` off a Mac) move the selected
  element before the element above it or after the one below it, among the
  elements in its parent; texts between them stay where they are. a
  `<script>`, frame, `<object>`, `<embed>`, `<base>`, `<link>` or `<meta>`,
  and an element that holds one, does not move: moved, it would run, load
  or read the page's addresses again
- an element's line has a handle, `⋮⋮`, at its start, shown with the pointer
  on the line and on the selected line. drag it onto another element's line:
  its top quarter puts the element before that one, its bottom quarter after
  it (or first in it, where its line is open), and its middle into it, at its
  end; the top half of an end tag's line puts it in that element, at its end.
  a line over or under the target, or a ring around it, shows where it goes.
  esc while dragging lets it go where it was. it cannot go into itself, an
  element in it, or an element with no content such as `<img>`. undo puts it
  back where it stood

a field closed as it was opened makes no edit, and one whose edit is refused
stays open, red, until it is fixed, left with esc or the focus leaves it,
and no key or button of the tree acts while it is open. `<html>`, `<head>`, `<body>` and an element that holds devknobs'
own nodes are not edited as html, hidden, deleted or moved, and a text straight in
a shadow root or the document is not edited.

the keys are plain and act only on the selected line, never while a field
has the focus. the bar under the tree has the same actions for the selected
line: `edit text`, `+ attribute`, `edit as html`, `hide` (or `show`),
`delete`, `move up` and `move down`, and the line's `copy` copies its markup. it works the same on the
width knob's frame. an edit of the html is made on the live DOM: where the
page's framework renders again and changes or replaces the node, the edit
stays in the list as text, and undo then only takes it out.

### edit the styles

the styles can be edited in place, as in the browsers' own tools, in both
modes, and each edit goes on the page at once:

- a click on a value makes it a field. a click elsewhere puts its value on
  the page too, and that click still does what it does, as opening another
  value or turning a line off. enter puts the new value on the page,
  escape leaves it as it was, and tab puts it on and goes to the next value,
  shift and tab to the one before. a value the page does not take turns red
  and stays open. `!important` at its end is kept
- the checkbox at a line's start, in a gutter every line keeps, turns the
  declaration off and on. it shows with the pointer or the focus on the line,
  and always on a line that is off, which stays where it stood, struck
  through and faint, and goes back there when it is turned on. Tab reaches
  it and space turns it; it is named `turn off padding` or `turn on padding`
- typing a property's name, or a value, opens a list of suggestions under
  the field, filtered by what was typed, those that start with it first.
  names are every property the browser knows, asked of the browser, and the
  custom properties the page sets. values are the property's keywords the
  browser takes (`CSS.supports`), named colors where it takes a color,
  `var(--x)` for each custom property, and `inherit`, `initial`, `unset`,
  `revert` and `revert-layer`. ↑ and ↓ mark one (↓ also opens the list), ↩
  takes the one marked (with none marked ↩ puts on what was typed), Tab
  takes the one marked or the first, and in a name goes on to the value. esc
  closes the list, and a second esc leaves the field. a click on one takes
  it. in a value the word at the caret is what a suggestion replaces, so
  `1px so` becomes `1px solid`
- `+ add property` under `element.style` and under each rule takes a name,
  then a value. `element.style` shows even with no `style` attribute, so a
  property can be added to the element itself. in `simple` mode the line is
  under the list and adds to the element's own style
- `+ new rule` under the element's rules, in both modes, adds a rule. its
  selector starts as the element's classes (`.cta.cta-lg`), or a short
  selector that finds it where it has none, then the states forced on it
  (`.cta:hover`), and can be changed first. enter adds the rule, escape
  leaves none, and a selector the browser does not take turns red and stays
  open. a click or tab elsewhere adds the rule where the selector was
  changed, and none where it was left as it opened. the rule goes in a
  stylesheet of devknobs' own in the element's document, the width knob's
  frame's too, and its `+ add property` opens at once, unless it was added
  by a click elsewhere or the filter hides it. it is listed with the element's rules, from `new rule`, also while it
  does not match the element (its selector quiet, its lines struck through),
  so a `:hover` rule can be written without the state forced. undo takes it
  off the page

the changes at the foot of the view count the edits, `changes (N)`, and
that count is a button that shows the diff and folds it away again. the diff
is folded at first, and stays as it is left, for the next view and after a
reload; the buttons, the kept edits and those that wait for `apply`, with
their values, show either way. the diff lists the edits as `-` the value before and `+` the value after, under the rule, what
it sits in (`@media`, `@layer`, the rule a nested `&` is in) and its
stylesheet, or `style=""` and the element for its own style. a new rule is
under `new rule for` and the element's selector: `+ .cta:hover { }`, then its
declarations. an element's
html edits are under `html of` and its selector: `- text: "Start now"`,
`+ class: "cta cta-lg"`, the markup an element had and has, `+ hidden`, the
markup of a node deleted, and where a moved element stood and stands:
`- at the end of <ul class="menu">`, `+ before <li class="a"> in <ul class="menu">`.
several edits of one property come to one change, and one that went back to
where it started to none. `Z` undoes the last edit and `⇧Z` (`Shift Z` off
a Mac) does it again, while the focus is in the view and not in a field. `copy prompt for
agent` copies a prompt that asks a coding agent to put the edits in the
code: each element's selector, its file and line where grab finds them, the
rule and its stylesheet, and each property from its value before to its
value after, a new rule with its selector to add where the element's styles
are written, and for the html each text, attribute and markup from before
to after, a hide, a delete and a move, with the place it went as selectors
(``move it: at the end of <ul class="menu"> -> before <li class="a"> in <ul class="menu"> (into `ul.menu`, before `li.a`)``). with html edits it ends by asking the agent
to change the component or template that renders the element, not the DOM,
as the framework's next render may undo an edit of the DOM. `copy diff` copies the diff lines alone, and `undo all` takes
every edit back. reset in the footer undoes the edits with the knobs, and so
does `unmount()`; `devknobs.reset()` leaves them. an edit whose page goes, as
a frame's reloads, stays in the list as text, and undo then only takes it
out. `window.devknobs.edits()` gives the edits in force as json, and
`setEdits()` makes such a list again (see [agents](/docs/agents)). the line
under the buttons says so: `agents read and apply edits: devknobs.edits() / setEdits()`.

### keep edits after reload

the switch `keep edits after reload` at the top of the view is off at
first, and a reload loses the edits. on, it keeps the edits in force for the
page, its origin and path without the query, and keeps them again on each
change: their kinds, selectors, rules and values before and after, as plain
json, no node of the page, though they hold the page's text, attribute
values and element markup as edited (up to 64K characters each). as the
page loads again, once it loaded and nothing on it changed for 300
milliseconds (3 seconds at most, so a framework has drawn it), devknobs
makes them again in order. each is made
only where its element is found by its selector, its rule by its selector,
what it sits in and its stylesheet, and the page still has the value it had
before it; a new rule is made anew. after a delete, a move or an html edit
that is not made, no later edit is (`an earlier edit it may depend on was
not made`): it may stand on that one. the changes say
`5 edits kept from before the reload`, or `4 edits kept from before the
reload, 1 could not be found` with a line for each one not made and why
(not found on the page, its rule is not on the page, the page has another
value now). from then on they are edits like any other: undo, the changes
and the prompt take them. the next change keeps the edits in force then, so
those not made are dropped from what is kept.

html and attribute edits are never made as the page loads. from the first
of them on, the kept edits wait in the changes, listed under `1 kept html
edit waits` (with how many edits come after it), until you click its
`apply`: a page script could have planted them, and markup or an attribute
can run a script. only your own click on that button makes them, and even
then an html edit with `<script>`, a frame, `<object>`, `<embed>`, `<base>`,
`<meta>` or `<link>`, an `on…` handler, a `srcdoc` or a `javascript:`
address, such an attribute (a `javascript:` item in an svg `values` list
too), and any attribute or text of the page's own `<script>` (a data script
such as `application/ld+json` too, and svg's), `<base>`, frame, `<object>`,
`<embed>`, `<link>` or `<meta>`, is not made (`could run a script`). an
html or attribute edit that could run a script by its own text is not kept
either; one that is risky only for the element it is on may stay kept, and
is refused each time it would be made. the list shows what `apply` would
make: each edit's markup or `name="value"`, cut at 120 characters with
`show all` for the rest, and `apply` waits until each one is shown whole,
under `apply only edits you made on this page`. while edits wait, nothing new is kept, so what is kept stays as it
was; turning the switch off forgets them too. edits made in another page
of the site keep under that page's path, the one it loaded at, also once
its app's router moved.

turning the switch off forgets the page's edits; it leaves the ones on the
page. the switch is on for a page while it keeps edits, in every tab. a
page keeps its first 200 edits, up to 256 KB of json; past that the changes
say `only the first 200 edits are kept after a reload`. edits are kept for 20
pages at most: the page kept longest ago is forgotten first. forced states
are no edits and are never kept, nor are edits made in the width knob's
frame. with the npm package they are in the page's `localStorage`, one item
per page, `devknobs:edits:` and the path; in fresh mode nothing is kept or
made again; with the
extension, in the extension's own storage (see
[the extension](/docs/extension)). see [privacy](/docs/privacy) for how to
clear them.

### force a state

chips over the rules, `:hover`, `:focus`, `:focus-visible`, `:active` and
`:focus-within`, force a state on the element: the page draws it as if the
pointer were on it, it had the focus or it were pressed, and the styles show
the rules of that state as applying, and those with `:not()` of it as not.
several can be on at once. forcing is no edit: it is not in the changes, and
it ends when another element is shown, the view closes, reset in the footer
is pressed or devknobs unmounts. `:hover` and `:active` reach the element's
ancestors too, and a focus makes them match `:focus-within`, as with the
real state.

a page's script cannot set those states, so devknobs emulates them: the
element and its ancestors carry `data-devknobs-force`, and each rule of the
page with a forced state in its selector is copied into a stylesheet of
devknobs' own, the state written `:is(:hover, [data-devknobs-force~="hover"])`,
as heavy as before, in the same `@media`, `@supports`, `@container`,
`@layer` and `@scope`. the copies are made again as the stylesheets change.
where that falls short:

- a stylesheet from another origin cannot be read, so its rules are not
  copied
- the page's own rule still applies too, so one with `:not(:hover)` still
  draws while `:hover` is forced, though the styles show it as not applying
- a copy comes after the page's rules, so it wins a tie of equal weight that
  the page's order would have lost
- `:has()` finds a state only on the element and its ancestors, and an
  `@scope` with no start is scoped to the whole document
- a rule in a `@layer` with no name is not copied: a copy would be a layer
  of its own, in another place in the order
- only the selectors of a list that have the state are copied, but a rule
  nested in such a list, as `.a:hover, .b { .icon { } }`, is copied under
  the whole list, `:is(.a:hover, .b) .icon`, so it comes again after the
  page's rules for `.b .icon` too
- `:visited` is not forced: browsers hide it from a page

`devknobs.forceState()` does the same for an agent (see
[agents](/docs/agents)).

### what inspect cannot show

- the rules of a stylesheet from another origin. the page may not read them,
  so the view says `rules hidden` with the file's name and guesses nothing,
  and its tooltip says they cannot be edited
- the browser's own default styles, which cannot be edited either
- a rule in a `@container` it could not confirm is marked `container`, and
  may not apply
- an edit made through the CSSOM alone, or to a stylesheet outside the head,
  may show late
- a closed shadow root, a frame's document inside the tree, and a
  `<template>`'s content

the tree has no line numbers, and there is no right
click menu: the bar under the tree holds the actions.
