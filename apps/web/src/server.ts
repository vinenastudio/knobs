import handler from '@tanstack/react-start/server-entry';
import earlyScript from '@vinena/knobs/early?raw';
import { initWorkersLogger } from 'evlog/workers';
import { canonicalRedirect, docsRedirect } from './lib/canonical.ts';
import { paraglideMiddleware } from './paraglide/server.js';

interface WorkerEnv {
  AXIOM_DATASET?: string;
  AXIOM_TOKEN?: string;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

// The Workers runtime's streaming HTML rewriter, as far as this file uses it.
interface RewrittenElement {
  prepend(content: string, options: { html: boolean }): void;
  remove(): void;
}
declare class HTMLRewriter {
  on(selector: string, handlers: { element(element: RewrittenElement): void }): HTMLRewriter;
  transform(response: Response): Response;
}

/**
 * Puts devknobs' early script first in `<head>`, ahead of the charset, viewport
 * and stylesheets React hoists there, so a reload with a device set paints the
 * device's mat from the first frame instead of the page full width. It takes
 * the place of the empty slot `__root.tsx` renders for it, so React hydrates
 * the slot onto this script and every other head script onto its own. The slot
 * sets `dangerouslySetInnerHTML`, so the script's text does not fail hydration,
 * and `suppressHydrationWarning`, which silences the dev warning that the text
 * differs; an empty slot alone fails hydration on that text.
 */
function withEarlyScript(response: Response): Response {
  if (!response.headers.get('content-type')?.startsWith('text/html')) {
    return response;
  }
  return new HTMLRewriter()
    .on('head', {
      element(head) {
        head.prepend(`<script data-devknobs-early>${earlyScript}</script>`, { html: true });
      },
    })
    .on('script[data-devknobs-early]', {
      element(slot) {
        slot.remove();
      },
    })
    .transform(response);
}

let loggerReady = false;

async function initLoggerOnce(env: WorkerEnv): Promise<void> {
  if (loggerReady) {
    return;
  }
  loggerReady = true;
  if (env.AXIOM_TOKEN && env.AXIOM_DATASET) {
    const { createAxiomDrain } = await import('evlog/axiom');
    initWorkersLogger({
      drain: createAxiomDrain({
        dataset: env.AXIOM_DATASET,
        token: env.AXIOM_TOKEN,
      }),
      env: { service: 'web' },
    });
  } else {
    initWorkersLogger({ env: { service: 'web' } });
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContextLike): Promise<Response> {
    await initLoggerOnce(env);
    const { createWorkersLogger } = await import('evlog/workers');
    const log = createWorkersLogger(request, { executionCtx: ctx });
    const url = new URL(request.url);
    log.set({ method: request.method, path: url.pathname });
    try {
      const response =
        canonicalRedirect(url) ??
        docsRedirect(url) ??
        withEarlyScript(await paraglideMiddleware(request, () => handler.fetch(request)));
      log.set({ status: response.status });
      return response;
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      throw error;
    } finally {
      log.emit();
    }
  },
};
