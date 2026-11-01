import { relative, resolve } from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { unplugin as stylex } from '@stylexjs/unplugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { build, defineConfig, type Plugin } from 'vite';
import { tuneEndpoint } from './vite.tune.ts';

// The dev server runs devknobs from its source in packages/devknobs, so an edit
// there reloads the page with no build. Builds use the package's dist, which
// turbo builds first. The early script (`@vinena/knobs/early?raw`) is built from the
// current source too.
function devknobsSource(): Plugin {
  const root = resolve(import.meta.dirname, '../../packages/devknobs');
  const early = '\0devknobs-early';
  return {
    apply: (_config, { command, isPreview }) => command === 'serve' && !isPreview,
    config: () => ({
      resolve: {
        alias: [{ find: /^@vinena\/knobs$/, replacement: resolve(root, 'src/index.ts') }],
      },
    }),
    configureServer(server) {
      // The source asks for its device images beside src/engine, where the
      // build copies them; in the package they sit in assets/bezels.
      const from = `/@fs${root}/src/engine/bezels/`;
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith(from)) {
          req.url = `/@fs${root}/assets/bezels/${req.url.slice(from.length)}`;
        }
        next();
      });
    },
    // Before Vite's own `?raw` loader, which would read the package's dist.
    enforce: 'pre',
    async load(id) {
      if (id !== early) {
        return;
      }
      const result = await build({
        build: {
          copyPublicDir: false,
          lib: { entry: 'src/early.ts', formats: ['iife'], name: 'devknobsEarly' },
          write: false,
        },
        configFile: false,
        envFile: false,
        logLevel: 'silent',
        root,
      });
      // One output, as an array or alone depending on how Vite was started.
      const [built] = [result].flat();
      const [chunk] = built && 'output' in built ? built.output : [];
      if (chunk?.type !== 'chunk') {
        throw new Error(`devknobs: could not build ${root}/src/early.ts`);
      }
      // An edit to any of its sources rebuilds it on the next request.
      for (const file of chunk.moduleIds) {
        this.addWatchFile(file);
      }
      return `export default ${JSON.stringify(chunk.code)};`;
    },
    name: 'devknobs-source',
    resolveId: (id) => (id === '@vinena/knobs/early?raw' ? early : undefined),
  };
}

const repoRoot = resolve(import.meta.dirname, '../..');

export default defineConfig({
  environments: {
    // Grab reads these maps to name components and their files on knobs.dev.
    // Browsers fetch a map only for DevTools or grab, so visitors pay only for
    // the kept names. Paths from the repo root, not this machine's.
    client: {
      build: {
        rolldownOptions: {
          output: {
            minify: {
              compress: { keepNames: { class: false, function: true } },
              mangle: { keepNames: { class: false, function: true } },
            },
            sourcemapPathTransform: (source, map) =>
              relative(repoRoot, resolve(map, '..', source)).replaceAll('\\', '/'),
          },
        },
        sourcemap: true,
      },
    },
  },
  plugins: [
    tuneEndpoint(resolve(import.meta.dirname, '.tune')),
    devknobsSource(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    react({ compiler: true }),
    // debug:false — StyleX's dev `data-style-src` attribute embeds file:line, and the
    // React Compiler (client-only) shifts line numbers vs the SSR transform, causing a
    // hydration attribute mismatch that detaches React's event tree (dead forms).
    stylex.vite({ debug: false, enableFontSizePxToRem: true, useCSSLayers: true }),
    paraglideVitePlugin({
      cookieName: 'PARAGLIDE_LOCALE',
      outdir: './src/paraglide',
      project: './project.inlang',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
    }),
  ],
  server: {
    // Vite ignores PORT by default; portless assigns one when proxying https://knobs.localhost.
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
  },
});
