# Product

## Facts

| Fact             | Value                  | Asked by |
| ---------------- | ---------------------- | -------- |
| product.kind     | dev-tool               | router   |
| product.name     | knobs                  | llms-txt |
| site.url         | https://knobs.dev      | llms-txt |
| llms.sections    | /docs Docs, /blog Blog | llms-txt |
| llms.pages_title | Pages                  | llms-txt |

## Blocks

| Block    | Version | Source                          | Applied    |
| -------- | ------- | ------------------------------- | ---------- |
| llms-txt | 1.0.2   | mertbuilds/cleanstarter@3490648 | 2026-11-03 |

agent-start is not applied: no page has an agent section. The hero and `/docs/start` carry one secondary "Copy installation prompt" button instead (`apps/web/src/lib/copy-install-prompt.tsx`, on the site's own `CodeBox`), which copies the whole `install_prompt` and says "Copied" for 2 seconds. The full prompt is in llms-full.txt, in the start reference.
