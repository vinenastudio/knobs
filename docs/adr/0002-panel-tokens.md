# ADR-0002: The site wears the knobs panel's tokens

Date: 2026-10-05. Status: accepted. Supersedes the Styling row of [ADR-0001](0001-stack.md).

## Decision

| Area    | Decision                                                                                                                    | Why                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Styling | StyleX tokens copied from the knobs panel's stylesheet: its warm neutrals and grab's blue, its radii, its system font stack | The site and the tool on it look like one product, not two designs |

ADR-0001 chose black/white plus 3 grays, a 4px radius and Suisse Intl (fetched, Inter fallback). The site is a demo of the panel, and the panel runs on top of it, so the site now takes the panel's look instead.

## Consequences

- Suisse Intl and the Inter fallback are dropped, with the font pipeline that served them: `fonts.css`, `@fontsource-variable/inter`, `scripts/fetch-fonts.sh`, `pnpm fonts` and the deploy step that fetched the files.
- The tokens in `packages/ui/src/tokens.stylex.ts` mirror the values in the panel's stylesheet (`packages/devknobs/src/ui/styles.ts`). When the panel's values change, update the tokens to match.
- The 4px spacing scale from ADR-0001 stays.
