# Product

## Facts

| Fact              | Value                  | Asked by    |
| ----------------- | ---------------------- | ----------- |
| product.kind      | dev-tool               | router      |
| product.name      | knobs                  | llms-txt    |
| site.url          | https://knobs.dev      | llms-txt    |
| llms.sections     | /docs Docs, /blog Blog | llms-txt    |
| llms.pages_title  | Pages                  | llms-txt    |
| agent_start.pages | /docs/start            | agent-start |

## Blocks

| Block       | Version | Source                          | Applied    |
| ----------- | ------- | ------------------------------- | ---------- |
| llms-txt    | 1.0.1   | mertbuilds/cleanstarter@f071a17 | 2026-11-03 |
| agent-start | 1.0.0   | mertbuilds/cleanstarter@0a950be | 2026-11-03 |

agent-start is built on the site's own `CodeBox` (`apps/web/src/lib/code-box.tsx`, the source copy-command was harvested from), so copy-command is not applied.
