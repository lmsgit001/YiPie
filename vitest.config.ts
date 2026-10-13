import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // Pure logic runs in node; component tests opt into jsdom per file with
    // `// @vitest-environment jsdom` so the fast majority is not slowed down.
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/contract/**', 'src/domain/**', 'src/platform/**'],
      exclude: ['src/entrypoints/**'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
