---
name: shadcn-cssinjs
description: How to add components from the shadcn-cssinjs registry (StyleX + Base UI, copy-paste-own) to packages/ui — fetch mechanics, the CLI bug workaround, and this repo's adaptation checklist. Use when adding or updating any packages/ui component.
metadata:
  internal: true
---

# shadcn-cssinjs Registry Skill

shadcn-cssinjs (https://www.shadcn-cssinjs.com) is a shadcn-compatible registry of components styled with StyleX on Base UI primitives. We copy components into `packages/ui/src/ui/` and own them.

## Source of truth

- https://www.shadcn-cssinjs.com/llms.txt — full docs index (append `.md` to any docs URL for markdown)
- Component docs: `https://www.shadcn-cssinjs.com/docs/components/<name>.md`
- Item JSON: `https://www.shadcn-cssinjs.com/r/<name>.json`
- Registry index: `https://www.shadcn-cssinjs.com/r/registry.json` (~56 items, includes data-table built on TanStack Table)

## Installing a component

**Known bug (checked 2026-09-03):** `npx shadcn add <item-url>` fails — the CLI resolves the registry's bare `registryDependencies` (`stylex-tokens`, `stylex-utils`) against ui.shadcn.com instead of the item's own origin. Until fixed upstream, fetch directly:

1. `curl https://www.shadcn-cssinjs.com/r/<name>.json` → each `files[]` entry has `path` (`registry/bases/stylex/ui/<name>.tsx`) and `content`.
2. Write content to `packages/ui/src/ui/<name>.tsx`.
3. Note `dependencies` (npm) and `registryDependencies` (other items — fetch those too if missing; `stylex-tokens`/`stylex-utils` already live in `src/lib/`).

## Adaptation checklist (required, in order)

1. **Imports**: `@/lib/tokens.stylex` → `../lib/tokens.stylex.ts`; `@/lib/utils.stylex` → `../lib/utils.stylex.ts`; `@/components/ui/<x>` and `@/ui/<x>` → `./<x>.tsx`. No path aliases in this package (TS7 removed `baseUrl`; everything is relative with explicit extensions).
2. **Named stylex imports**: `import * as stylex` is banned (oxlint `import/no-namespace`). Convert to `import { create, props as stylexProps, defineConsts, ... }` and rewrite `stylex.props(` → `stylexProps(`, `stylex.create(` → `create(`, etc. Same for `import * as React` → named/type imports.
3. **exactOptionalPropertyTypes**: optional props consumed with possibly-undefined values need `| undefined` (e.g. `className?: string | undefined`).
4. **No next-themes / Next-isms**: theming is `prefers-color-scheme` via `src/theme.css` variables — replace `useTheme()` with static `"system"` where it appears (see `sonner.tsx`).
5. **Tokens**: components must reference `../lib/tokens.stylex.ts` (CSS-var consts). The radius scale there is pinned to `var(--radius)` = 4px — do not reintroduce the registry's calc() scale.
6. **Export** from `src/index.ts`; run `pnpm exec oxlint --fix packages/ui/src && pnpm format`.
7. **Story = test**: add `src/ui/<name>.stories.tsx` with at least one `play` interaction test. Base UI animates popups — assert `toBeInTheDocument` after `findByRole`, not mid-transition `toBeVisible`, and wrap close-assertions in `waitFor`.

## Theming

`src/theme.css` defines the shadcn CSS variables (grayscale black/white system, `--radius: 4px`, dark via `prefers-color-scheme`). It is imported by the Storybook preview and the web app root. Changing the design = editing these variables, not component files.
