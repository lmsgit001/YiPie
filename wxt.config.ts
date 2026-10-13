import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '一瞥 Yipie',
    description:
      'Summarize any webpage with your own LLM API key. Local-only, no backend, no telemetry.',
    // Deliberately minimal. Host permissions for model endpoints are requested
    // per-origin at runtime (optional_host_permissions) once the user adds a
    // model config, so installing the extension grants access to nothing.
    permissions: ['storage'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      // Chrome does not use modulepreload in extension pages (cross-world
      // extension resource mismatch) and everything is read from local disk.
      modulePreload: false,
    },
  }),
});
