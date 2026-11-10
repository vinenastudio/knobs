import nkzw from '@nkzw/oxlint-config';
import { defineConfig } from 'oxlint';

// Type-aware linting and TS compiler errors are enabled via CLI flags in the
// root `lint` script: `oxlint --type-aware --type-check` (powered by tsgolint).
export default defineConfig({
  extends: [nkzw],
  ignorePatterns: [
    'node_modules',
    'dist',
    '.output',
    '.turbo',
    'storybook-static',
    '.wrangler',
    'apps/web/src/paraglide',
    'apps/web/src/routeTree.gen.ts',
    'apps/web/worker-configuration.d.ts',
    '.claude/skills',
    // devknobs keeps its own style and checks (bun test, tsc).
    'packages/devknobs',
  ],
  overrides: [
    {
      // Scripts ego-browser runs: node with ego's taskSpace, and page.evaluate bodies in the page.
      env: { browser: true, node: true },
      files: ['**/*.ego.mjs'],
      globals: { taskSpace: 'readonly' },
      rules: { 'no-console': 'off' },
    },
    {
      files: [
        '**/*.test.*',
        '**/*.stories.*',
        '**/test/**',
        '**/scripts/**',
        'packages/ui/.storybook/**',
        // Development tools, never in a build: their words are not site copy.
        'apps/web/src/dev/**',
      ],
      rules: {
        'react/jsx-no-literals': 'off',
      },
    },
  ],
  rules: {
    // All user-facing strings go through Paraglide (`m.*()`). This catches
    // hardcoded JSX text and text-bearing attributes; disable inline only
    // with a justification comment.
    'react/jsx-no-literals': [
      'error',
      {
        allowedStrings: ['•', '·', '—', '/', '%', '×', '+'],
        restrictedAttributes: [
          'label',
          'placeholder',
          'title',
          'alt',
          'aria-label',
          'aria-description',
        ],
      },
    ],
  },
});
