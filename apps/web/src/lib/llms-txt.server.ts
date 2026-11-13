import { llmsTxtConfig } from './llms-txt.config.ts';
import { createLlmsTxt } from './llms-txt.ts';

export const llms = createLlmsTxt(llmsTxtConfig, {
  cache: !import.meta.env.DEV,
  render: async (request) => {
    const [{ default: handler }, { paraglideMiddleware }] = await Promise.all([
      import('@tanstack/react-start/server-entry'),
      import('../paraglide/server.js'),
    ]);
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
  routePaths: async (): Promise<Array<string>> => {
    const { getRouter } = await import('../router.tsx');
    // `/docs` 301s to `/docs/start` in the worker, but this calls the handler directly and skips
    // the worker, so `/docs` is dropped here; `extraPaths` lists `/docs/start`.
    return Object.keys(getRouter().routesByPath).filter(
      (path) => path.replace(/\/$/, '') !== '/docs',
    );
  },
});
