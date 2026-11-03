import { defineConfig } from 'vitest/config';

// The unit tests of the llms files. Apart from vite.config.ts, which starts the Worker build.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
