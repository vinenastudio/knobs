# Contributing

The `@vinena/knobs` npm package and its site, <https://knobs.dev>, in one monorepo:

| Path                 | What                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| `packages/devknobs/` | The `@vinena/knobs` npm package ([README](packages/devknobs/README.md)) |
| `apps/web/`          | The site, knobs.dev                                                     |
| `packages/ui/`       | The site's StyleX components                                            |

The site is a copy of [mertbuilds/web-starter](https://github.com/mertbuilds/web-starter) with everything a
landing page does not need taken out: no api, no database, no auth, no billing, no e2e. What is
left is a TanStack Start app on Cloudflare Workers, the StyleX component package behind it, and
the tooling that keeps both honest. The founding stack decisions are in
[docs/adr/0001-stack.md](docs/adr/0001-stack.md): that record covers the whole boilerplate, and
this repo keeps only the web half. Agent rules and workflow live in [AGENTS.md](AGENTS.md).

## Stack

| Layer       | Choice                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| Monorepo    | pnpm workspaces + Turborepo, Node 24, TypeScript 7                     |
| Web         | TanStack Start (React 19 + Compiler) → Cloudflare Workers              |
| Styling     | StyleX tokens (the knobs panel's) + Base UI components + Storybook     |
| i18n        | Paraglide v2 (en only)                                                 |
| Analytics   | Self-hosted OpenPanel, page views only, `/api/op` reverse proxy        |
| Logging     | evlog wide events to an Axiom drain                                    |
| Lint/format | oxlint (`@nkzw/oxlint-config`, type-aware) + oxfmt, no ESLint/Prettier |
| Tests       | Vitest, Storybook stories as tests in real Chromium                    |

## Develop

Prereqs: Node 24 (`nvm use`), pnpm 11 (corepack), bun 1.3 (knobs builds and tests with it).

```sh
pnpm install
cp apps/web/.env.example apps/web/.env
sudo pnpm exec portless proxy start --https   # one-time: local HTTPS proxy on 443 + trusted CA
pnpm dev                                      # mprocs: web + storybook
```

Local URLs come from [portless](https://portless.sh): stable named HTTPS domains instead of ports:

| Service   | URL                               |
| --------- | --------------------------------- |
| web       | https://knobs.localhost           |
| storybook | https://storybook.knobs.localhost |

`pnpm exec portless service install` starts the proxy on boot.

| Command             | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `pnpm dev`          | Web + storybook, in mprocs panes                                   |
| `pnpm test`         | Story tests in real Chromium + knobs' `bun test`                   |
| `pnpm lint`         | oxlint, type-aware                                                 |
| `pnpm format:check` | oxfmt, the CI check                                                |
| `pnpm typecheck`    | `tsc --noEmit` per package                                         |
| `pnpm build`        | turbo build (knobs' `dist`, then the Workers bundle)               |
| `pnpm storybook`    | Component workshop (standalone, :6006)                             |
| `pnpm bad-day`      | Nuke node_modules + all caches, reinstall (`DRY_RUN=1` to preview) |
| `pnpm skills:check` | Warn when dep majors drift from verified agent skills              |

**Fonts.** None ship. The site uses the knobs panel's system font stack.

**Env.** Every var is optional: the site runs with no `.env` at all, just without analytics.

**Deploy.** `pnpm --filter @knobs/web deploy` builds and ships to Cloudflare Workers; a push to
main does the same from CI.

## knobs

`pnpm dev` runs the site against knobs' source, so an edit in `packages/devknobs/src` reloads
the page. To release a new version: in a PR, bump `version` in `packages/devknobs/package.json`
and add the `CHANGELOG.md` entry. After the merge, tag it:

```sh
git tag knobs@X.Y.Z && git push origin knobs@X.Y.Z
```

The Release workflow publishes it to npm through trusted publishing (no token). One-time setup (npm 11.15 or later):
`npm trust github @vinena/knobs --file release.yml --repo vinenastudio/knobs --allow-publish`.

## Going to production: accounts checklist

- [ ] **Cloudflare**: Workers; secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` in GitHub
- [ ] **Custom domains**: `knobs.dev` and `www.knobs.dev` attached to the `knobs-web` Worker
- [ ] **OpenPanel**: repo variable `OPENPANEL_CLIENT_ID` (public project id); without it production ships without analytics
- [ ] **Axiom**: dataset + token as Worker secrets (`AXIOM_TOKEN`, `AXIOM_DATASET`) for the evlog drain
- [ ] **Branch protection**: PRs only, CI required on `main`
- [ ] **Turbo remote cache** (optional): `TURBO_TOKEN` secret + `TURBO_TEAM` var
