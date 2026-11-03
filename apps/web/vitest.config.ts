import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { unplugin as stylex } from '@stylexjs/unplugin';
import { defineConfig } from 'vitest/config';

// The unit tests of the llms files and of the install prompt. Apart from vite.config.ts, which
// starts the Worker build. StyleX and Paraglide compile here as they do there, so a component
// renders to markup. StyleX's dev server hook is left out: its CSS timer only stops with an http
// server, which vitest never starts.
export default defineConfig({
  plugins: [
    {
      ...stylex.vite({ debug: false, enableFontSizePxToRem: true, useCSSLayers: true }),
      configureServer: undefined,
    },
    paraglideVitePlugin({ outdir: './src/paraglide', project: './project.inlang' }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
