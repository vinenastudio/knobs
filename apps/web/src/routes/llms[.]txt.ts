import { createFileRoute } from '@tanstack/react-router';
import { textResponse } from '../lib/llms-txt.ts';

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async (): Promise<Response> => {
        const { llms } = await import('../lib/llms-txt.server.ts');
        return textResponse(await llms.index());
      },
    },
  },
});
