# changelog

## unreleased

- the `keep edits after reload` switch is in the settings now, with a short hint under it, and no longer at the top of the Elements view. as before, it is not there in fresh mode or in devknobs' frame, which keep no edits
- the line between the DOM tree and the styles is a full-width drag handle, also moved with ↑ ↓

## 0.6.0

- every edit field in inspect, the DOM tree's texts and attributes, the html editor and the styles' values, wraps its lines and grows down, so a long value or address never scrolls sideways, at any panel width and in the width knob's frame
- the styles show `;` after every declaration, in the simple mode too and on a line that is off, as the browsers' tools do. it is drawn apart from the value, never part of what is edited
- edits made in devknobs' frame, with the panel pinned or a device shown, are kept for the page while the frame shows it (same origin and path), and after a reload they are made again in the frame once its page settles. edits made in any other window are still not kept
- in inspect's styles, ↩ and Tab with no suggestion marked take the first only where it completes the word typed (`bl` takes `block`); a number such as `1`, a `#` color, a word ended with a space and an empty field keep what was typed. taking `var(--x)` after a typed `var(` no longer doubles it
- an empty name or value field in inspect's styles shows every suggestion as it gets the focus. ↩ and Tab in it, before an arrow key, fill nothing; ↑ or ↓ then ↩ takes the one marked. a press on the list or its scrollbar keeps the focus in the field
- the panel has one width: the rows, the settings and every view (inspect's elements and styles, the requests, the storage) show at it, so opening or leaving a view no longer changes the width or glides it. it starts at 320 and goes from 240 to 720 (a width kept by an older version stays as it was), and dragging the edge or its keys in any view sets it for all of them. a view no longer starts at 340 with a width of its own. preferences kept by an older version keep the rows' width and drop the view's
- inspect's styles suggest as you type, as the browsers' tools do: a property's name lists every property the browser knows (asked of it at run time) and the page's custom properties, and a value lists the keywords the browser takes for that property, named colors where it takes a color, `var(--x)` for each custom property and the global keywords. ↑ ↓ mark one, ↩ takes the one marked, Tab takes it or the first (in a name it goes on to the value), esc closes the list and a second esc leaves the field, and a click takes one. it is a listbox with `aria-activedescendant`
- the DOM tree's `edit as html` is an editor: the panel's monospace with line numbers, html colored (tags, attributes, values, comments), ↩ keeps the indent and goes one in after an opening tag, `>` closes the tag (not a void one), and `"` after `=` pairs. a grip drags its height and `expand` makes it as tall as the panel, both kept in the panel's preferences. `⇧↩`, its `apply` button and esc work as before, and so do its refusals
- the changes at the foot of the Elements view fold their `-` and `+` lines away at first: `changes (N)` shows them, and the way it is left is kept in the panel's preferences. the buttons, the kept edits and those that wait, with their values, show either way
- each declaration in the styles has a real checkbox in a gutter of its own, as in the browsers' tools: shown on hover and focus and always on a line that is off, checked while on, its line struck through and faint while off, reached with Tab and turned with space, named `turn off padding` or `turn on padding`. it no longer sits over the property's name

- `⇧N` opens the requests from a closed panel too, as `⇧S` does the storage view, and pressed again while they show, leaves them
- two new shortcuts: `⇧E` shows inspect's elements view, the DOM tree and the styles, on the element inspect last picked, else the page's body, without picking, and `⇧O` shows the settings. both open the panel where it is closed, leave their view when pressed again, work from the width knob's frame, and do nothing while a field of the page has the focus. they are listed under shortcuts, to set or put back. where the `hotkey` or `grabKey` option takes `⇧E` or `⇧O`, the elements view takes the next free of `⇧L` and `⇧D`, and the settings the next free of `⇧U` and `⇧P`. keys you already set still work, and the only new defaults are `⇧E` and `⇧O`
- a shortcut can be any key or combination, a key alone too, such as `c`, or `⇧C`: the recorder no longer asks for a modifier. a key alone acts only when no field has the focus, the panel's search included, so it never takes what is typed. a `grabKey` of a key alone works the same. the defaults stay as they are
- inspect's styles can be edited, as in the browsers' own tools, in both modes: a click on a value makes it a field (set as the page's own script sets a property, so a longhand inside a shorthand and a value with `var()` keep, enter puts it on the page, a click elsewhere puts it on too and that click still does what it does, an empty value is refused, escape leaves it, tab goes to the next value, a value the page does not take turns red and stays open, `!important` is kept), the box at a line's start turns a declaration off and on, the line struck through where it stood while off, and `+ add property` under `element.style` and each rule adds one. `element.style` shows with no `style` attribute too. a stylesheet from another origin says in its tooltip that it cannot be edited
- the changes at the foot of the Elements view count the edits and list them as `-` before and `+` after lines under their rule or the element's own style, with `copy prompt for agent` (a prompt with each element's selector, its file and line where grab finds them, the rule and stylesheet, and each property from before to after), `copy diff` and `undo all`. `Z` undoes the last edit and `⇧Z` (`Shift Z` off a Mac) does it again, while the focus is in the view and not in a field. reset in the footer and `unmount()` undo every edit; `devknobs.reset()` leaves them. an edit whose page goes, as a frame's reloads, stays in the list as text and lets go of the page, and undo then only takes it out; a page kept for back and forward keeps its edits live, and a panel handed to the page's own copy leaves the edits on the page. the copy buttons say `could not copy` when the clipboard refuses, and page text in the prompt that could pass for a line of its own is written as a json string
- `window.devknobs.edits()` gives the edits in force as json: `kind` (`css-value`, `css-toggle`, `css-add`, `css-rule`), `target` (`selector`, `source` where grab finds it, `rule` with `selectorText`, `sheet`, `owner`, `sheetId` (tells two stylesheets with the same address apart), `path` and `context`, the `@media`, `@layer` or outer rule it sits in, which the diff and the prompt name too), `property`, `before` and `after`. the `Edit`, `EditKind` and `EditTarget` types are exported, and the package's agent skill tells an agent to read them and put them in the code
- inspect's DOM tree can be edited, into the same changes: a double-click on a text (or ↩ on its line) or on an attribute makes it a field (`name="value"`, as in the tag, `"` written `&quot;`: change it, rename it, write several or clear it to take it out; a text or value with line breaks opens in a field that keeps them, `⇧↩` or its `apply` button puts it on; a field closed as it was opened makes no edit), `a` adds an attribute, `F2` edits the element as html (enter breaks the line, `⇧↩` (`Shift Enter` off a Mac) or its `apply` button puts it on, html with no element is refused, the new element is selected), `h` hides the element and all in it with `visibility: hidden` through an attribute of devknobs', never its `style`, and shows it again, and Delete or Backspace deletes the node, which undo puts back where it stood. the keys are plain, act on the selected line and never in a field, and a bar under the tree has the same actions. `<html>`, `<head>`, `<body>` and an element that holds devknobs' nodes are never replaced, hidden or deleted, and html with devknobs' own `data-devknobs` attributes is refused. a field whose edit is refused stays open and no other action runs. two deletes, or a real `hidden` attribute and a hide, are never listed as one. it works in the width knob's frame too. the changes list them under `html of` and the element's selector, `edits()` gives them as `kind` `text`, `attr`, `html`, `hide` and `delete`, and the prompt for an agent lists each one from before to after and asks the agent to change the component or template, as a framework's next render may undo an edit of the DOM. an edit whose node the page changed or replaced since stays in the list as text, and undo then only takes it out

- inspect's styles can add a rule: `+ new rule` under the element's rules, in both modes, takes a selector that starts as the element's classes (or a short selector that finds it) and the states forced on it, such as `.cta:hover`, refuses one the browser does not take, and opens `+ add property` on the new rule. a click elsewhere adds the rule only where its selector was changed. the rule is in a stylesheet of devknobs' own in the element's document, the width knob's frame's too, which no other view reads as the page's. it is listed with the element's rules, from `new rule`, also while it does not match. undo takes it off the page and redo puts the same rule back. the changes list it under `new rule for` the element, `edits()` gives it as `kind` `css-rule` (`property` `rule`, `after` the selector, `target.rule.sheet` `new rule`), and the prompt asks the agent to add it where the element's styles are written
- inspect's styles can force a state: chips over the rules for `:hover`, `:focus`, `:focus-visible`, `:active` and `:focus-within` make the element draw as in that state, and the styles show its rules as applying. it is emulated with a `data-devknobs-force` attribute and copies of the page's rules with the state, in their `@media`, `@supports`, `@container`, `@layer` and `@scope`, made again as the stylesheets change. it is no edit, and ends when another element is shown, the view closes, on reset in the footer or on `unmount()`. a stylesheet from another origin is not copied, nor a rule in a `@layer` with no name, a page rule with `:not(:hover)` still draws, and a copy comes after the page's rules, so it wins a tie of equal weight that the page's own order would have lost. `devknobs.reset()` leaves a forced state: `forceState(null)` ends it. `window.devknobs.forceState(elementOrSelector, states)` does the same for an agent, and the `ForcedState` type is exported
- inspect's DOM tree can move elements, into the same changes: `⇧↑` and `⇧↓` (`Shift Up` and `Shift Down` off a Mac) on the selected element's line move it before the element above or after the one below among its siblings, never while a field has the focus, and an element's line has a handle, `⋮⋮`, on hover and while selected, that drags it before or after another element or into one, a line or a ring showing where it goes, esc letting it go where it was. the bar under the tree has `move up` and `move down`. `<html>`, `<head>`, `<body>`, devknobs' own nodes and an element that holds them never move, nor does a `<script>`, frame, `<object>`, `<embed>`, `<base>`, `<link>` or `<meta>` or an element that holds one, nor does an element into itself, one in it or an element with no content. undo puts it back where it stood, unless the page moved it since. the changes list it under `html of` the element as `- at the end of <ul class="menu">` and `+ before <li class="a"> in <ul class="menu">` (`the 2nd <li>` among alike siblings, and a move is never dropped as no change), `edits()` gives it as `kind` `move` with `from` and `to` (`parent` and `next` as selectors), and the prompt asks the agent to move it, the place as selectors. the `EditPlace` type is exported
- the Elements view has a switch at its top, `keep edits after reload`, off at first. on, the edits in force are kept for the page (its origin and path) as plain json, and as the page loads again and settles they are made again in order, each only where its element, rule and value before are still there; a new rule is made anew. the changes say `N edits kept from before the reload, M could not be found` and list those not made, and they are edits like any other after; those not made are dropped from what is kept at the next change, and after a delete, move or html edit not made, no later edit is made. html and attribute edits are never made as the page loads: they wait in the changes until the user's own click on `apply`, as a page script could have planted them, and while they wait nothing new is kept. off forgets them. an edit that could run a script (`<script>`, frames, `<object>`, `<embed>`, `<base>`, `<meta>`, `<link>`, `on…`, `srcdoc`, `javascript:`) is never kept nor made again, by `setEdits()` either, nor is an attribute or text edit of the page's own `<script>` (data scripts too), `<base>`, frame, `<object>`, `<embed>`, `<link>` or `<meta>`. the waiting list shows each edit's markup or `name="value"` as apply would make it, under `apply only edits you made on this page`. kept edits hold the page's text, attribute values and markup, up to 64K characters each, under the path the page loaded at. fresh mode keeps and makes none. a page keeps its first 200 edits, up to 256 KB, for 20 pages at most, the page kept longest ago forgotten first; forced states are never kept, and edits made in devknobs' frame keep as the page's while it shows the page. they are in the page's `localStorage` under `devknobs:edits:` and the path, none in fresh mode
- `window.devknobs.setEdits(list)` makes edits again from a list in `edits()`'s shape, through the same log as the panel's, html and attribute edits at once (an agent's call, which waits for no click), none that could run a script, and resolves to `{ applied, skipped }`, each skipped with why; anything but a list throws a `TypeError`. `window.devknobs.undoEdit()` undoes the last edit in force and returns it, or null. so an agent can save `edits()` and make them again on a fresh load. the `SavedEdit`, `Skipped` and `Replayed` types are exported. the changes' note says `agents read and apply edits: devknobs.edits() / setEdits()`

## 0.5.3

- a host can load the frame's page itself: `native.load(frame, url)`, given an address on the page's own origin, is called once the frame is in the document, on its first load and on each load again. it returns true where the host set the frame's address itself, such as a browser extension from its own world, which the page's `frame-src` policy does not bind, and false to leave it to devknobs. false, or no `load` at all, and devknobs sets the address as before
- with a host that answers `native.refused`, the refusal notice waits for its answer, 6 seconds at most, and a `retry` with `now` runs with the notice hidden and loads the frame again, so a refusal the host gets past never shows. with no host the notice shows at once, as before
- the frame's screen is covered while its page loads, in the frame's own canvas color with a small dot that breathes (still with reduced motion), and through each load again a host runs after a refusal, so a browser's error page never flashes in the device. it goes as soon as the frame's page can be read, before its load event, when the notice shows, or after 8 seconds at most. with no host the notice shows at once, as before
- a page's fixed or sticky bar at the top or bottom of the viewport no longer shows a thin row of the scrolling page past it at the screen's edge: the frame's edges fall between device pixels, so a seam in the bar's color covers each edge a bar holds, under Safari's bars. a page's `Look` gains `header`, true where a fixed or sticky bar holds the top
- switching devices, the screen between the two wears the loading cover, its canvas in the scheme the knob forces or else the user's own, never the page's white, with the dot in the middle, and the opening keeps every corner as round as the screen's roundest from the old device to the new, so a foldable's cover screen no longer morphs lopsided. the loading cover follows the user's scheme too, not the page's
- real phone mode, a switch in the settings, off by default, shown only with a host that sends requests as another browser, such as the extension: the device's browser goes to the host as `native.ua` with `frame: true`, for the frame's own page loads alone, so a site serves its mobile site. `panel.realPhone` sets it from `setState()`, and the host hears each turn through `native.realPhone(on)`, to keep it as one setting for every tab and site, as the extension does. the frame loads again when it turns
- a drawn iPhone with an island cuts its screen as round arcs concentric with the body, not a superellipse inside a round body: one bezel on every side, the screen's radius the body's less it (62 on the 17 Pro and Air, 55.8 on the 16 and 16 Plus, 63.2 on the 16 Pro, 63.6 on the 16 Pro Max), and the page's clip is a plain radius. a phone's bezel image keeps its own corners. `Mock` loses `continuous`
- a size that leaves the device behind, such as a width typed in or full, takes the browser the device brought too, so the ua knob goes back to system and no host sends a phone's user agent for the plain size
- a device in the frame no longer hands a host its browser: `native.ua` gets null for the browser a device brought, so the extension sends no phone user agent to servers and no site sees one session as two browsers, which some answer by signing you out. the frame's page still reads the device's browser in `navigator`, and the page around the frame keeps the real one. a browser picked in the ua knob, or a device a host sizes the whole tab to (`native.viewport`), is still handed on

## 0.5.2

- a host can let a page's own copy run the panel: `mount({ host: true, prefer })` shows prefer (extension or page) in the settings, and with page, a copy the page mounts takes the page from the host, which takes its panel, frame and patches away and does not take it back. `setPrefer()` brings a choice that comes in after the mount. page copies from 0.4.0 to 0.5.1 cannot take over, so the extension's panel stays on those pages. the footer names the copy that runs the panel and its version, such as `extension 0.5.1` or `page 0.5.1-local.1767225600`; `bun run link` builds the local version into the code
- two hosts on one page, such as the store's extension and a local build of it: `mount({ host: true, build: 'store' | 'local', stoodDown })` puts the host's rank on the page, and the one that ranks higher holds the page whichever mounted first (a local build over a store one, then the newer version). the other stands down for that page load, calls `stoodDown` and does not take the page back, and the holder's footer adds `store extension stood down`. a host with a build takes the page back from an older host that has none
- a feature's view, inspect's Elements view, requests and storage among them, makes the panel as tall as the window, past the 672 px a list stops at. inspect's DOM tree takes the height the styles leave it, and keeps the height its edge was dragged to
- the panel paints over grab's and inspect's boxes, which no longer tint it, and over the page's top layer: its modal dialogs, popovers and fullscreen element, and anything with the highest z-index. grab's boxes go over the page's open dialogs and popovers, so what is in them can be inspected. both are manual popovers where the browser has them, put back in order whenever the page opens something there, and none of a page's popover or backdrop rules reach them. while a page's modal dialog is open the panel still shows on top but takes no pointer, as the browser makes everything outside the dialog inert; its keys still work
- `holdInTopLayer(element, LAYER.guide)` puts a page's own layer in that order, over the panel and under the touch cursor, as a tour of the panel needs; the returned `release()` lets go of it
- fit draws a device, or any frame of a set width and height, as big as the window allows, mock and readout row included, past 100% too (fit 135% for an iPhone 17 Pro in a 1000 × 1300 window). a frame of the window's height or of a width alone still never grows past 100%, and the zoom presets stay as they are
- on a local host (localhost, `*.localhost`, `*.local`, a loopback or private network address) the tab's icon and the apple-touch-icon get a yellow `DEV` ribbon across their top right corner, drawn in the page from the site's own icons, so a dev tab tells itself apart from production. `DEV` shows on icons of 32 px and up. each link keeps its own address in `data-devknobs-href` and gets it back when the ribbon goes off or devknobs unmounts. icons a framework puts in on a navigation get the ribbon too. a page with no icon link gets its `/favicon.ico`, where it has one. an icon from another origin that does not allow reading it keeps its own picture. the dev tab icon switch in the settings turns it off, or on for any host, for the tab, and `panel.devIcon` (`auto`, `on`, `off`) does the same from `setState()`
- an iPhone's status bar is iOS 27's, as measured on the iOS 27.0 simulator: glyphs about 7% bigger than iOS 26's, and a flat battery, the charged part of a solid body in the glyph's color and the rest gray, no outline, its cap apart, with no number; bars, wifi and time where iOS puts them, a size up on the screens 420 wide and up (Pro Max, Plus and Air). the island is a flat black pill of iOS 26.5's size, as the iOS 27 simulator draws none, and the island phones' screens have continuous, squircle corners
- Safari's glass takes its tint from the page under each capsule and from the scheme, as iOS 27 does: #f8f8f8 over white and #898989 over black in light, #b3b3b3 over white and #222222 over black in dark, and the content's own hue over a saturated one, lighter in light. its glyphs are black in light and white in dark, and its rim is as bright at the bottom as at the top. compact ends in the tabs button, and the page menu is three lines. the strip over the page takes the color of a fixed or sticky bar at the top, else the body's; `theme-color` is ignored. the address shows the host without its port
- upright, the page gets Safari's real viewport in every layout and state (402 × 714, 654 and 660 expanded, 754, 754 and 768 minimized on an iPhone 17 Pro, the page under the address bar at 122 in top), so `innerHeight`, `visualViewport`, `100dvh` and `position: fixed; bottom: 0` land where they do on the phone. the page runs on under the bars to the screen's bottom, from a picture of the document past the viewport that follows the scroll, at full strength, as iOS 27 draws no scroll edge there; a fixed footer's color is carried down instead, and a page from another origin gets the content's color at the page's bottom edge. the room after the end of the page is gone. the edge to edge switch is offered only with the phone held sideways, not on the iPhone Duo, where it still runs the page under Safari's top row; upright it does nothing and its stored value is kept
- the iPhone Duo's Safari is Safari 27.1's, as measured on the iOS 27.1 simulator. upright on the cover screen the status and Safari's buttons stack in a column on the right, under the camera hole: the time, a ring for the battery round wifi with the signal's four dots in its gap, back, reader, and new tab with tabs, and the address floats at the bottom of the page. the page never runs under the column, which takes the page's color. held across, the cover turns its top to the right, its camera hole to the bottom right (folded open or shut from there, by the knobs or the fold slider, the fold plays in view, its frames turned half round so the hinge stays on the cover's top and the hole at its bottom right; unfolded from there the inner case is the same phone's, half round, its buttons on the right and bottom, the page upright, till the Duo is turned, folded the other way or picked again), and has no status and no column, only one bar along the top with back, reader, the address, share, new tab and tabs. the inner screen has one bar at the top, held either way: back, reader, the address, new tab with tabs, the time and the ring; minimized, a small domain pill alone. no scroll edge under the bars. the page gets the simulator's viewports: 382 × 580 on the cover screen upright (618 minimized, WebKit's), 678 × 386 and 440 across, 669 × 871 and 900 on the inner screen upright, 951 × 589 and 618 across. the Duo offers only its own layout
- `screen.width`, `screen.height`, `availWidth` and `availHeight` in a phone's or tablet's frame are the device's, upright on an iPhone. the iPhone Duo reports its cover screen, 466 × 678, on either screen, and 466 to `availHeight` on the cover held across
- Safari's top bars, on the iPhone Duo's inner screen and in an iPhone's top layout, give the page room as they minimize and take it back as they come back without pushing it: the page scrolls as far as its top moves, so the content stays under the finger, and the touch finger is read on the screen, not in the moving frame, so the bars no longer flip back and forth on a short scroll. scrolling back up, with the wheel or a finger, they come back while the page is still their room from its top, and the frame takes its new box at once, so reaching the top never pushes the page down once they settle. they minimize only once the page is far enough down for both
- minimized, Safari's strip goes: the content at the top of the page shows under the status bar in a wash of the page's color that fades out over 100 px, and the status bar's glyphs follow it. a fixed or sticky header keeps its color

## 0.5.1

- published from vinenastudio/knobs on GitHub Actions through npm trusted publishing, with provenance. no code changes

## 0.5.0

- first release as @vinena/knobs (was devknobs)
- a click on a row's `×` puts the row back to its default and keeps it listed; press and hold it for a second to take the row off the list, as a click did before. the `×` fills while held, letting go early or moving off cancels, and enter or space held on it for a second does the same. its label says `reset <row> (hold to remove)`
- inspect's view is laid out as the browser's Elements panel: the DOM tree on top, the breadcrumbs under it, then the styles. each line is a node in the panel's words and colors, `<tag attr="value">`, a triangle on what opens, `<tag>…</tag>` closed and `</tag>` on its own line open, text in quotes, comments, `<!DOCTYPE html>`, `#shadow-root (open)`, and `::marker`, `::before` and `::after` with content. a pick reveals its element, a click on a line shows its styles, the pointer on one boxes it on the page, and the arrows, Home and End move as in the panel. the selected line ends with `== $0`, and `$0` is that node on the page's window while the view is open, unless the page has its own. `copy`, or cmd or ctrl and c, copies its outer html. the tree follows the page as it changes and lights what changed, reads a node's children only once it opens, shows 500 children before `Show all nodes (N more)`, and never shows devknobs' own nodes. with the width knob's frame up, it is the frame's page

## 0.4.0

- a request in full is laid out as the browser's own network panel lays it out, in its words: tabs for Headers, Payload, Preview, Response, Initiator, Timing, Cookies and EventStream, the ones the request has, in place of `body`, `headers` and `more`. Headers has General and both sets of headers with a Raw toggle, Payload the query, the json sent as a tree and a form's fields, each with view source, and Response the body numbered and colored, a long line wrapping in from where it starts. the tab, the sections and the toggles stay for the next request. Preview shows json as a tree, an image from its address with its size, html drawn in a sandboxed frame and other text as it is. Initiator has Request call stack and Request initiator chain. Timing has Queued at and Started at, then Resource Scheduling, Connection Start and Request/Response, a bar and a duration each, from Resource Timing, with the Type, Size and Protocol columns under it. Cookies lists Request Cookies and Response Cookies with the browser's fields, and EventStream an `EventSource`'s messages as Id, Type, Data and Time
- `EventSource` is recorded: a row a connection, `eventsource` in the Type column and under `fetch/xhr`, with the last 200 messages of the types the page listens for, each up to 4 KB
- devknobs' styles, the panel's, grab's, the frame's and those it puts on the page, are constructed stylesheets where the browser adopts them, so a page whose Content Security Policy blocks inline styles no longer gets the panel unstyled. a browser without them gets `<style>` elements as before. the early stand-in's picture sets its styles through the CSSOM, which such a policy allows
- `native.ua` hands the host the browser the page's requests go out as, from the ua knob or a device's browser, so it can send that user agent and its client hints to servers. the page's own patches stay, it is handed with the switch off too, and a promise it returns holds the frame's next load until it settles
- `mount({ native })` hands text size, offline and the prefers knobs to a host that sets them for real, such as a browser extension through the DevTools protocol, in place of emulating them in the page. without it nothing changes
- `native.viewport` takes a plain size or a device with nothing drawn around it, so the host sets the tab's own viewport, ratio and touch screen in place of the frame. anything drawn keeps the frame, and the host gets `null` meanwhile
- a frame that holds the browser's error page, as for a page that refuses to be framed, no longer gets a message, which logged an error
- the knob rows start at the panel's inset, with no column kept for the grip: it shows over the row's icon on hover or focus, and in its place where there is no hover
- `native.setting` puts a switch for the host's driver in the panel's settings, and `setNative(on, note)` sets it from the host: off, every knob is emulated in the page as with no driver, and kept as it was. without a `setting` nothing shows
- a navigation to another origin inside the frame takes the whole tab there, as it would with no frame, where it got the refusal notice: a sign-in provider that refuses frames is no longer a dead end. a form's post stays in the frame, since the tab could only follow it without its body. chromium only (the Navigation API); a server's redirect to another origin still gets the notice
- text size sizes a root the page leaves unset against the browser's own default, so a default other than 16px, such as one a host set for real and left behind, is not counted twice
- `setSystemMedia({ scheme, motion })` gives the panel and grab the user's own scheme and motion when such a host hides them from every media query in the tab. until it is called nothing changes
- `native.refused(url)` lets the host say why the frame's page was refused: a line under the notice, a "copy details" button and a button to look again. without it the notice is as before
- `native.framed(open)` hears the frame open, before its first load, and go; a promise it returns as the frame opens holds that load until it settles, and a `retry` with `now: true` runs and loads the frame again at once, with no press
- the width knob's frame, the panel and the style that hides the page under the frame go back where a page's script takes them out, as a React root on `<body>` does as it starts (x.com), or puts a new `<body>` in, which left the page blank with no frame. the frame loads its page again then. a page that keeps taking them out gets them back less often, with one warning in the console
- `mount({ host: true })` holds the page as its host, as the extension's copy does: a copy the page mounts later takes no panel of its own, it hands its `hotkey`, `grabKey`, `grab`, `open` and `grabColor` to the host, and its `unmount()` leaves the host's panel up. `window.devknobs` stays the host's, and the page copy's own `getState`, `setState`, `ready` and the rest go to the host. the host's switch for its `native` driver stays as it was when it takes the page back. a copy without this, such as 0.3.0, still takes over; the host then takes the page back from it, up to three times per page, then lets it be with a warning in the console. without a host, a second copy takes over as before
- the early script leaves the page alone where a copy of devknobs already holds it, such as the extension's, which mounts before any page script: only the React hook goes in, so no stand-in hides the page with nothing to take it away

## 0.3.0

### agents

- `describe()` lists every knob as json, with its values, its default and what applying it reloads: nothing, the frame or the page
- `ready()` resolves with the state once the frame has caught up, the frame's own devknobs is up (or 1.5 seconds after its page loads without one), the pseudo text is in and the panel has finished its slide. a page reloading for the locale knob never settles it. it rejects at once with `devknobs: not mounted` when devknobs is not mounted or unmounts during the wait, and past 10 seconds with an error
- `setState()` throws a `TypeError` at an unknown knob or field, or a value the knob does not take, and changes nothing. `panel.pinned` takes only row ids, each once. `setState(getState())` works
- `panel.handle` hides the panel's handle for the tab, so a closed panel stays out of screenshots. the show handle switch in the settings shows it off then, and turning it on brings the handle back
- `reset()` leaves the panel open or closed, docked or not, and its handle as it is. `describe()` says so
- `grab()` takes an element, an array or a NodeList of them, skips entries that are not elements and resolves `null` when none are left
- both are on `window.devknobs` and exported from `devknobs`
- `mount()` and `<DevKnobs />` put the api on `window.devknobs` too, not only the script tag build, and take it away on unmount. the copy in the width knob's frame has it as well
- `grab()` finds the right line on a dev server whose source map is off in more cases: a tag also named in a comment or a string, a `key` after a spread, a list item among others of its tag, and a helper called from more than one place. where it cannot find the line, `source.lineNumber` is null, not a line of the transformed module
- `grab()` resolves with the payload even when the clipboard copy fails, as it often does in headless browsers. `copied` says whether it reached the clipboard
- an agent skill ships in the package at `skills/devknobs/SKILL.md`

### grab

- the copied line no longer ends in an `nth-child` selector chain. it shows a selector only when it is built from a test id, a label, a stable id or another meaningful attribute (href, src, role, name, title, alt). each entry's new `selector` field has the full one

## 0.2.1

### device frame

- the frame and device code (bezels, the iPhone Duo's fold, browser bars) is a chunk of its own, loaded the first time a knob needs a frame, also when a saved device comes back. `import "devknobs"` loads much less up front, and the early stand-in covers the page until the frame draws. `dist/index.global.js` keeps it all in one file
- when the frame exits on its own, as when its code or the page in it does not load, the device goes back to none and the browser it brought goes back to system, as picking none does. a ua you picked since is kept. a failed load says so once in the console, and each device pick after it goes back to none

### grab

- the first grab is quicker: frames from packages are named from their path, so their bundles and source maps are no longer fetched, and the scan for jsx calls no longer slows down on a long inline source map
- the hit test under the pointer skips children whose box is nowhere near it

### panel

- less work while the page sits idle: the 1 Hz tick leaves a row's text alone when it did not change, the locale leaves `lang` and `dir` on `html` alone when they hold the value, and a media query list gets its guard only once the page listens to it, so a page that reads `matches` in render no longer keeps every list alive

### package

- the install section starts with a setup prompt to paste into an AI agent, and the Next.js example is a whole client component
- the package names its home page, https://knobs.dev, its repository and where to report issues, so npm links them, and the author's name has its ü

## 0.2.0

### requests

- `⇧N`, or `requests` in the search, shows what the page asks for, as a view in the panel: `fetch` and `XMLHttpRequest` whole, and what the page loads on its own by its timing and size. a row opens its request in full, and copy puts it on the clipboard as text for an AI, with the values of secret headers left out. the key can be set in the settings like the others

### fresh mode

- `?devknobs=fresh` in the page's address shows the page and the panel as a first visit sees them: `localStorage` is left alone, and every load devknobs did not ask for starts with no knobs set. the footer says so while it is on

### inspect

- `⇧C` (`Shift C` off a Mac), the inspect action in the search or its key in the footer picks an element as grab does and shows its css in the panel, in place of the rows, read only: its `style` attribute, the rules that reach it in cascade order with overridden declarations struck through, each rule's `@layer`, `@media`, `@supports` and `@container` and its stylesheet's file, its `::before` and `::after`, what each ancestor hands down, color swatches and what a custom property resolves to. a click copies nothing. a stylesheet from another origin shows as `rules hidden`. the key is set in the settings like the others, and `inspect` in the search no longer finds grab. the styles have two modes, set beside the filter and kept: `simple`, the default, lists only the declarations that apply to the element, grouped by what they do, with what it inherits folded under them, and `advanced` is the cascade view above
- every custom property a value reads through `var()` is a piece of its own in both modes, for the pointer and the tab key, nested ones and those inside `calc()`, `color-mix()` and gradients too, and so is the name of a `--custom` declaration. its tooltip says what the element, or the pseudo-element shown, sees for it at that moment, so a knob that moved shows: the value, cut in its middle where it is long, with a swatch for a color, and under it the selector of the rule that sets it, the element's own or the ancestor's it comes from. one that is not set says `not set`, and what the fallback of its `var()` comes to. text in a string, a comment or a `url()` that looks like a call is left alone. a click still copies nothing. a declaration's name now has a color of its own, a calm blue, with the value in the text's color and `:` and `;` quiet, and the names in a request's headers and a cookie's fields have the same color, so a key looks the same across the panel. an overridden declaration stays quiet all over
- inspect draws the box of the element under the pointer, as the browsers' tools do: content blue, padding green, border yellow, margin orange. a turned or scaled element is drawn by its own corners where the browser has `getBoxQuads`, and by its bounding box where it has not. grab keeps its plain box
- the styles view starts with the element's box under `box`, in both modes: margin, border, padding and content one inside the other with the length of each side, the content's size, and the offsets of a positioned element. the pointer on an area draws it alone on the page. a narrow panel says the lengths in a line under the box. the fold stays the way you leave it
- inspect's label is a card: the element and its size, then its color and background, the font its text is likely set in with its size, line height and weight, the wcag contrast with a mark for level AA, and its margin and padding, each only where it applies. the font is the first family of the list that the browser says is there, as a page cannot ask which font a glyph was drawn with
- picking is a mode that ends with the pick, as in the browsers' own tools: a click shows the element in the styles view and nothing stays drawn on the page, which takes clicks again. the view's bar starts with a select button at its left, as the browsers' tools have it, on its own ground while the picking is on, that starts it again, and `⇧C` does the same and stops it while it picks. escape ends the picking and keeps the element. inspect's row opens the view on the element it holds, and picks only with none: it says `picking`, the element's name, or `off`, stays listed while it holds an element, and its x and reset all let go of the element. a crumb, the box's diagram and the name in the view's head box their element on the page while the pointer is on them. with no element the view has no bar: while it picks, one line says to pick an element, and with the picking off that line is the button that starts it. an element that left the page is said so in the same way, in a line you press to pick another. starting grab ends the picking, and the reverse
- inspect has a row as grab and replay animations do: run from the search, the add knob list, the footer or its row, its row stays in the list, says `picking` while it picks, and its x takes it off and ends the picking. its key in the footer and its row now turn it off where it is on

### storage

- a storage view in the panel (`⇧S`, or search for storage, data, cookies): `localStorage`, `sessionStorage` and the cookies a page can read, to look at, copy, edit, add and delete; IndexedDB and Cache Storage to read; clear site data in one go after one question; and presets, named sets of values to put back with a press or on every load. see the storage section of the readme

### panel

- the pin button in the footer, and the pin panel action in the search, dock the panel to its side as a column the height of the window, like devtools. the page runs in a frame beside it, so its viewport really is narrower: media queries, `100vw` and fixed boxes follow. pinning loads the page once more when no frame is up, and never with a device or a width set. the pin is kept with the panel's place. the column is as wide as the panel, a view's width while one shows, and its edge sets that width down to a page of 320px. the page follows the column's edge frame by frame as the panel opens, closes or glides to a view's width, and slides across as the column changes side. two buttons by the pin, and the move panel across action, take it to the other side and close it. run from the panel, pin panel and move panel across are rows like any action: the pin's row says `on` while the panel is pinned, and its `×` and reset all leave the panel where it is
- a pinned panel that closes slides all the way off its edge first, and its handle comes in from that edge after it. as it opens, the column comes out at once and the handle goes off the edge under it. the column is drawn in the same frame the page takes its room in, so no strip of the mat shows between the two on the way
- a fresh panel starts with its handle 128px below the top of the window, and opens from there, not from the very top. a place you already dragged it to is kept
- the panel's width is yours to set: drag its edge on the page's side, or focus the edge and press the arrows. a double click puts it back, and the width is kept
- grab, replay animations and requests have rows as the knobs do. run one from the search, the add knob list, the footer or its row and its row stays in the list, to drag where you want it. its row runs it, shows its key and whether a mode is on, and its x takes it off and turns the mode off. a key alone lists a mode only while it is on
- the head of the settings is the head every view has, and keeps the grip's column empty as a row with no grip does: its way back stands where a row's icon is, and its title where a row's name is

### iPhone Duo

- the half that turns shows the page at the text size knob's size: its lines meet the other half's at the hinge. a page that sets its own root font size folds right too
- the half that turns is sharp at the hinge through the whole fold, and blurs gently toward its free edge: 48 px at most, where it was 128. its top and bottom ends still blur into the black past them, at the hinge too
- nothing marks the hinge: the bend's dark strip is gone from both halves
- no thin dark line runs down the hinge as the Duo folds: the half that turns stops 2 px short of the hinge and the black under it 4 px short, each on an edge of its own, and the other half goes on under both, so the black never shows through the page's edge
- a fold that turns copies of the half has no black px down the hinge either
- where WebGL2 does not draw the half that turns, its blur rises with no lines down it: the blurred pictures laid over each other are twice as wide each, not four times, and each fades in exactly where the one under it is all in
- the half that turns is no longer shaded toward its free edge as it turns: it keeps the screen's own light, the same as the other half's, so no lines run down it. the three shades are still in the fold's numbers, at 0
- a shade brought back has no lines either: WebGL2 works it out at every px, and where gradients draw it they go through as many stops as its bends need, not 9
- a picture on the page that covers its box, or is contained in it, is cut and placed on the half that turns as the page shows it. it was stretched over its box, so a page that had not yet picked its picture for the open screen showed the folded screen's twice as wide as it is tall
- unfolding, the open screen's half shows the page as it lays itself out open, once it has picked what it shows there: its picture is taken again when the frame is drawn open, where the page changed since
- the half that turns shows the page's pictures as they were when its picture was taken, not as they are a moment later, the frame laid out for the other screen and back
- nothing devknobs put on the page is on the half that turns, nor the browser's box for a picture it could not load
- a rough picture of the page is kept by all it depends on: its screen, viewport and knobs, the device pixel ratio, the text size, the scroll and what the page's pictures show. one of the folded screen never stands in for the open one's

### types

- `GrabColorValue` and `MatColorValue` also take a hex of your own, `` `#${string}` ``, so a `switch` over them that covers every swatch needs a case for the rest
- `PanelValue`, and with it `DevknobsState`, has `docked`, true while the panel is pinned

### fixes

- a load devknobs asks for keeps the scroll position: the reload a locale or a device needs, the reload button in the device's browser bars, and a frame a knob brings up. the page, and the copy of it in the device's frame, go back to where they were once they are long enough, also when the host sends them to the top as it mounts. it stops as soon as you scroll, press a key or click, and a load of your own restores nothing

### colors

- the mat and grab's color take colors of your own: the plus after the swatches opens the browser's color picker, and a hex or `rgb()` can be typed in the field under it. the color shows on the mat, or on grab's box, while you pick it
- a color of your own is kept per site, up to 8 for the mat and 8 for grab, and the x on its swatch, or delete with the focus on it, takes it off. one the same as a swatch that is there picks that swatch
- the mat's lines and numbers go dark on a light color such as white or yellow, and the splash, the reload's stand-in and the early script follow any color

## 0.1.2

### iPhone Duo

- a fold goes at one constant speed, half a second shut to open, with no easing. the hinge under a hand on the fold slider still follows through its spring
- a fold started from the fold chip or the posture knob starts sharp: no grey bands where the text is, and no jump as it begins
- the half that turns shows the page in its own fonts, not a fallback
- a fold back, a hand letting go and a hand taking the hinge go on from exactly where the fold is drawn
- a draw that comes late slows the fold instead of skipping part of it
- the fold's frames for the end the Duo rests at stay decoded while it is shown in its bezels

### react

- `dist/react.js` has `"use client"` once, on its first line. a second one further down failed under Next.js with webpack

### internal

- `bun run link <app>` and `bun run unlink <app>` put a local build into an app's `node_modules` as a copy, and put the installed one back

## 0.1.1

### iPhone Duo

- every layer follows the frame on screen, so nothing drifts during slow slider drags
- the turning screen's free edge darkens as it stands up, measured from Apple's fold
- the whole turning screen blurs near a right angle

### device frame

- the status bar clock reads 04:20
- the device glides over when the panel changes side or opens and closes beside it

### panel

- a panel that shrinks, as a row closes, keeps its top instead of jumping to the bottom

### internal

- panel.ts and catalog.ts split into focused modules, no behaviour change

## 0.1.0

### breaking

- the default keys moved to shift: `⇧K` opens the panel (was `d`), `⇧R` replays animations (was `r`), and `⇧G` turns grab on and off with a press (was holding `⌘C`, `Ctrl+C` off a Mac). `⇧⌫` still resets
- `hotkey` is now the letter that toggles the panel with shift. `hotkey` and `grabKey` keep working; pass `grabKey: "meta+c"` to keep the old grab key
- the two iPhone Duo devices are now one, with an open or closed posture. a kept `iphone-duo-closed` or `iphone-duo-open` comes back as the Duo in that posture

### stored data

- every item devknobs keeps in session or local storage now carries a version, so a later release can change its shape safely. data kept by 0.0.3 carries over: knobs, place, keys and preferences read as before

### panel

- lives on either side of the window: drag or fling it across, and it keeps its place across reloads
- rows open their editor in place, one at a time, like an accordion
- an add knob button under the rows opens search; rows reorder by drag or by arrow keys
- rows regrouped: device and viewport split, related knobs merged into one row each, row icons from lucide
- a fresh panel lists device, scheme, text size and locale; grab is an action in the footer, not a row
- a control shows only once it does something (clock mode and speed, zoom, mat, header)
- settings behind a gear, sliding in like ios navigation: hide the handle, and rebind every shortcut, kept per site
- tooltips on icon-only controls; a refused key shakes and says why

### device frame

- a device change animates, and rotation turns the device in view
- each device has its own rounded screen opening, tracked frame by frame
- a mat color knob (classic green, magenta and more); a new color splashes out from behind the device
- a reload keeps the mat, case and safari ui, from a snapshot the early script puts back on the first paint
- safari's reload and stop glyphs redrawn to match iOS 26; reload waits for the new page and stop stops it
- the user agent box shows only for a custom user agent

### iPhone Duo

- folds in 3D around its hinge on Apple's hinge spring, from the device row's `fold` and `unfold`, or a fold slider
- the case is rendered offline from Apple's own Duo model, one frame every degree, shaded from Apple's bezel pictures
- the page stays flat behind the turning screen, as on Apple's product page
- the turning screen blurs through a small WebGL2 pass, safari's bars included, with plain layers as fallback
- thanks to jadon7: the scene, fold rig and screen projection come from [iphone-duo](https://github.com/jadon7/iphone-duo), MIT

### grab

- the frame waits for the pointer to settle before it moves on
- the frame glides on transforms alone, with no layout or page paint per frame
- turning grab on takes the focus out of the panel, so the arrows are grab's

### fixes

- the grab frame holds at fractional pixel ratios
- a focused plain scroll box leaves the shortcuts on; keys the panel acts on skip the browser default
- focus, touch and kept-place fixes across the panel
