---
title: requests and storage
meta_title: See network requests and edit storage with devknobs
description: See every request the page makes, laid out like the Chrome DevTools network panel, and read, edit and save local storage, session storage and cookies.
order: 6
updated: 2026-10-25
---

## requests

press `⇧N` (`Shift N` off a Mac) to see what the page asks for: a row a
request, the newest on top, with its method, name, status and time. filter
by address, method or status. click a row to open it, laid out as Chrome
DevTools' network panel:

| tab       | shows                                    |
| --------- | ---------------------------------------- |
| Headers   | general, response and request headers    |
| Payload   | query string, request payload, form data |
| Preview   | json as a tree, images, html             |
| Response  | the body as text                         |
| Initiator | the call stack that made the request     |
| Timing    | queueing, connection, waiting, download  |

copy puts a request on the clipboard as plain text, ready for an AI chat.
secret looking headers and parameters are copied as `<hidden>`, but bodies
are copied as they are, so check before you paste.

## what gets recorded

`fetch` and `XMLHttpRequest` are seen whole. an `EventSource` is a row with its messages. images, scripts
and other things the page loads get timing and sizes only. the last 300
requests stay in memory, and nothing is sent anywhere. load the
[early script](/docs/start) to catch the page's first request.

## storage

press `⇧S` to see what the page keeps in the browser, as one tree:

- local storage and session storage: read, edit, add and delete
- cookies: the ones the page can read, editable
- IndexedDB and cache storage: read only

one filter works over every table. clear site data empties it all after one
question. devknobs' own keys are hidden and kept.

## presets

save as preset keeps the storage items and cookies the filter shows, under a
name. apply one with a press, or turn on apply on load to set it on every
load. export and import them as json to share with teammates.
