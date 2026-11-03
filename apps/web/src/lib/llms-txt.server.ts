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
    // `/docs` shows `/docs/start`, which `extraPaths` lists, and points its canonical there.
    return Object.keys(getRouter().routesByPath).filter(
      (path) => path.replace(/\/$/, '') !== '/docs',
    );
  },
});
