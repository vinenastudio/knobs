---
title: requests and storage
description: See every request the page makes, and read, edit, clear and save what the page keeps in the browser.
order: 6
---

## requests

press `⇧N` (`Shift N` off a Mac), or find `requests` in the search, to see what
the page asks for, as a view in the panel: a row a request, the newest on top,
with its method, name, status and time. the view shows at the panel's
width, as wide as you drag its edge. a filter finds rows by address, method
or status, and `all`, `fetch/xhr` and `other` pick whose requests show. a click
on a row, or enter, shows it in full, laid out and worded as the browser's own
network panel does it: the method, path, status and time on top, then the tabs
the request has, the arrows moving between them.

- `Headers`: `General` (Request URL, Request Method, Status Code and Referrer
  Policy, where the request or the page sets one), `Response Headers` and
  `Request Headers`, each with a `Raw` toggle. `Redirected From` in General
  is knobs' own line: the browser lists a redirect as a row of its own,
  and a page cannot see those rows, so the address it was asked for shows
  here. Request Headers says
  `Provisional headers are shown`: the page knows the headers it set itself,
  not the ones the browser adds. there is no Remote Address, which a page
  cannot know
- `Payload`, where it sent a query or a body: `Query String Parameters`,
  `Request Payload` (json as a tree) or `Form Data` (urlencoded or multipart,
  a file as `(binary)`), each with `view source`, and `view URL-encoded` where
  it is urlencoded
- `Preview`: json as a tree, its top showing what it holds, a long string
  wrapping in from where it starts. an image is shown from its address, with
  its size in pixels and in bytes, for an image a script asked for with a GET
  and one the page loaded itself. html is drawn in a sandboxed frame that runs
  none of its scripts. other text shows as it is, and bytes say
  `This request has no preview available`
- `Response`: the body as text, a numbered line a row, json laid out, and
  json, html, css and javascript colored. a long line wraps in from where it
  starts
- `Initiator`: `Request call stack`, the function and its `file:line:col` a
  frame a line (a click copies the place), the frames of `node_modules` and
  of knobs one line that shows them, and `Request initiator chain`: the
  page, the script that made the request, and the request. what the page
  loaded itself says what loaded it, such as `an <img> element`
- `Timing`: `Queued at` and `Started at`, then `Resource Scheduling`
  (Queueing), `Connection Start` (Stalled, DNS Lookup, Initial connection,
  SSL) and `Request/Response` (Waiting for server response, Content
  Download), each with its bar and its duration, and the total. it comes from
  the browser's Resource Timing; a server on another origin that sends no
  `Timing-Allow-Origin` keeps the phases to itself, and then the timing shows
  what the page saw and says why. a request that runs says
  `CAUTION: request is not finished yet!`. under it, `Request` has the Type,
  Size and Protocol the browser's list has as columns
- `Cookies`, where there are some: `Request Cookies` and `Response Cookies`,
  each cookie with its Name, Value, Domain, Path, Expires / Max-Age, Size,
  HttpOnly, Secure and SameSite, the ones known. `Partitioned` is knobs'
  own word: the browser names the partition's top site, which a page cannot
  know. a page sees only the
  `Cookie` header it set itself, and never `Set-Cookie`, so this tab is rare
- `EventStream`, for an event stream: the messages an `EventSource` got, with
  their Id, Type, Data and Time. `message` is kept always, and another type
  once the page listens for it, as the page hears no other. the last 200 are
  kept, each up to 4 KB, a cut one ending in `…`. a stream read through `fetch` is not read, and says so

the tab you pick, the sections you close and the toggles you set stay for the
next request you open. each body has its own copy. the way back in the view's
head, or escape, goes one step back: from a request to the list, and from the
list to the panel's rows. escape empties a filter first. clear in the list's
head empties the log.

copy in a request's head puts it on the clipboard as plain text, ready to paste
into an AI chat. header values and address parameters that look like secrets
are copied as `<hidden>`: `authorization`, `cookie`, `set-cookie` and
`proxy-authorization`, and any header or parameter with `token`, `secret`,
`key`, `password`, `auth`, `session`, `signature`, `credential` or `jwt` in its
name. bodies are copied as they are, so check before you paste. the view shows
all of it as the page set it.

### what requests records

- `fetch` and `XMLHttpRequest` are seen whole: headers, bodies, status, timing
  and the stack of the call. an `EventSource` is a row a connection, with its
  messages and the stack of the call.
- what the page loads on its own (the document, images, stylesheets, scripts,
  fonts) is a quieter row with timing and sizes only. the browser gives a page
  no headers and no bodies for these, and no sizes from a server on another
  origin that does not allow it.
- no web sockets, and nothing a worker asks for.
- a body is kept up to 64 KB, and only where it is text. bytes are counted, and
  a stream the page sends is never read, nor is the body inside a `Request`
  object or an event stream. an answer that is still coming 2 seconds after
  its headers is kept as far as it came.
- the last 300 requests are kept, in memory. nothing is stored, and nothing is
  sent anywhere. a reload starts the log again.
- it records for as long as knobs is mounted, the view open or not, and from
  the page's first request with the [early script](/docs/start#early-script). there is no fake slow
  or failed response, and no throttling.

## storage

the storage action (`⇧S`, or search for storage, data, application, cookies)
shows what the page keeps in the browser, in the panel, as one tree laid out
as the browsers' own tools lay it out. a node is a store with what it holds:
how many items and how much, or that it has none. a node folds out in place
to its table: the store's own controls on the first line, then a line an item
under a head that names the columns. IndexedDB folds out to its databases, a
database to its object stores and an object store to its records, and cache
storage to its caches and a cache to its requests. nothing opens another
page. what a store asks and says is in its own node. a node folded away
builds none of its lines, and only the tables that are out are read again.
the first time, the first store with something in it is folded out; after
that the nodes are as you left them, until the page reloads.

one filter over the tree is for every table at once. a store with lines it
keeps folds out to those alone, and a store with none folds away, quiet; its
summary stays what it holds. a store whose own name matches keeps all its
lines. empty the filter and every node is as you left it. the databases, the
caches and their tables stay as you left them, and a table read a page at a
time is filtered over what is read, with the way to read on kept. escape
closes an open box, then empties the filter, then leaves the view:

- `local storage` and `session storage`: every key of `localStorage` and
  `sessionStorage`, its key and a one-line preview of its value each on a
  column, and its size. a row folds out to the whole value,
  laid out as json only where that changes nothing of it, with copy value,
  edit, duplicate and delete. a double click on a row edits its value. add
  takes `key=value`, a line each, or a json
  object of several keys. the list follows other tabs through the `storage`
  event and the page's own writes by reading again once a second, only while
  its node is folded out
- `cookies`: what `document.cookie` gives, and in Chromium the path, domain,
  expiry, secure and sameSite the cookie store knows. edit and delete write
  `document.cookie` at the cookie's own path and domain, and where those are
  not told, try the page's path, its folders and `/`. a cookie that could not
  be changed says so. a page cannot read cookies marked HttpOnly, and the
  list ends by saying so
- `IndexedDB`: the databases `indexedDB.databases()` lists, each with its
  version, and a database's object stores with their record counts. an
  object store folds out to its key path, auto increment and indexes, and its
  records numbered from 0, fifty at a time. read only: a whole database can
  be deleted from its node, a record cannot be changed
- `cache storage`: the caches of Cache Storage, each with how many requests
  it holds. a cache folds out to its requests numbered from 0 with the
  response's status, a hundred at a time, and a row folds out to the method,
  address, type and size. read only
- `presets`: named sets of values to put back into the page, see below. they
  stand last in the tree under `knobs`, as they are its own and not the
  page's

a store that can be emptied has clear among its controls, after one question.
the head of the view has refresh and clear site data: one question that lists what goes, with counts, then local and
session storage, every cookie the page can delete, every database and every
cache go in one go. what could not be removed is counted and said, and a
reload is offered, never done for you.

knobs' own items (the key `knobs` and every `knobs:` key, and their old names `devknobs` and `devknobs:`) are hidden
and kept by every clear. a list that has some ends with a quiet line that
says how many are hidden, and a press on it shows them.

### presets

save as preset keeps the local and session items and the readable cookies
the filter shows, under a name. a preset applies with one press, added to
what is there or in place of it, is renamed in its row, and is edited, exported and imported as
json, so it moves between machines and teammates. a preset holds at most 200
entries and 256 KB.

apply on load, a switch on a preset's row, sets the preset on every load of
the page, before the page's own scripts where the [early script](/docs/start#early-script)
is there and at mount where it is not. this writes to the page's real storage
on every load until it is turned off: the storage row in the panel says
`1 preset` while one applied, and reset all turns it off for every preset
without deleting any. a preset imported from someone else never applies on
load until you turn that on.

presets are kept in `localStorage` under `devknobs:storage-presets` and `knobs:storage-presets`, so they
are per origin and never apply anywhere else. in fresh mode they are neither
read nor kept.

### what storage cannot show

- cookies marked HttpOnly: a page cannot read them, so neither can knobs
- the storage of other origins, an iframe's or a cdn's included
- the list of databases where `indexedDB.databases()` is missing
- service worker registrations, WebSQL, the origin private file system and
  the quota

it reads through the page's own apis and wraps none of them. a database is
opened by name with no version, read in one read-only transaction and closed
at once, on every path, so the view never holds a connection that would block
the page's own upgrade. nothing is copied, kept or sent anywhere by itself:
the copy controls are the only way out.
