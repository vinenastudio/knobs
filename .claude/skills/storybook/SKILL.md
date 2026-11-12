---
name: storybook
description: Storybook documentation index — where to find current docs for writing stories, play-function interaction tests, the Vitest addon, and react-vite configuration. Use when writing or reviewing stories or Storybook config in this repo (packages/ui).
metadata:
  internal: true
---

# Storybook Docs Skill

This repo uses Storybook 10 (react-vite) in `packages/ui`. Stories are colocated (`Button.stories.tsx`) and double as component tests via `@storybook/addon-vitest` (browser mode, headless Chromium) — `pnpm --filter @knobs/ui test` runs them.

## Source of truth

**Always fetch current docs instead of answering from memory.**

- https://storybook.js.org/llms.txt — machine-readable doc index (states current version; repo pins 10.5.x — confirm they match with `pnpm why storybook`)
- https://storybook.js.org/llms-full.txt — complete docs dump (large; prefer per-page)

**Markdown access trick:** append `.md` to any docs URL for clean markdown, and filter snippets with query params:

- `https://storybook.js.org/docs/writing-stories.md?renderer=react&language=ts`
- `?codeOnly=true` returns only code snippets
- Older majors: `/docs/9/...` path prefix or `llms-full.txt?version=9`

Always pass `?renderer=react&language=ts` — this repo is React + TS.

## Pages most relevant to this repo

- https://storybook.js.org/docs/writing-stories.md?renderer=react&language=ts — CSF stories, args, meta
- https://storybook.js.org/docs/writing-stories/play-function.md?renderer=react&language=ts — interaction tests (our story tests)
- https://storybook.js.org/docs/writing-tests/integrations/vitest-addon.md?renderer=react&language=ts — addon-vitest setup (our `vitest.config.ts` uses storybookTest plugin + browser mode)
- https://storybook.js.org/docs/writing-stories/decorators.md?renderer=react&language=ts — decorators
- https://storybook.js.org/docs/api/main-config/main-config.md?renderer=react&language=ts — `.storybook/main.ts` (we add StyleX via `viteFinal` + `@stylexjs/unplugin`)
- https://storybook.js.org/docs/configure/styling-and-css.md?renderer=react&language=ts — CSS/fonts in preview (we import `theme.css` + StyleX output in `.storybook/preview.ts`)
- https://storybook.js.org/docs/get-started/frameworks/react-vite.md?renderer=react&language=ts — framework config

## Repo conventions

- One story file per component, colocated in the component's dir. Story = test: every component ships at least one `play` interaction test (`@storybook/test` userEvent/expect).
- Styling in stories uses `@knobs/ui` tokens only — no raw colors, no className/style props alongside StyleX (see the `stylex` skill).
- `.storybook/main.ts` wires StyleX through `viteFinal`; `previewHead` links `/virtual:stylex.css` (empty until first story compiles — expected, not a bug).
- Root `pnpm storybook` serves :6006; flag-passing needs `pnpm --filter @knobs/ui exec storybook dev --no-open` (pnpm filter can't forward flags).
- No official Storybook agent skill exists (checked 2026-09-02; storybookjs/storybook `.claude/skills/` are internal maintenance skills) — this local skill is the mapping; re-check when bumping majors.
