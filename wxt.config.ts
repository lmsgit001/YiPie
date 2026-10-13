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
    // Deliberately minimal: installing the extension grants access to nothing.
    // `optional_host_permissions` is a *declaration* of what we may ask for
    // later, not a grant — the user still sees a prompt per origin.
    permissions: ['storage'],
    // Host permissions are requested one origin at a time, when the user adds a
    // model (`platform/model/policy.ts`). Chrome only lets us ask for an origin
    // that the manifest mentions, so the two schemes are declared here as
    // *optional* — nothing is granted at install time, and `permissions.request`
    // narrows it to the endpoint the user actually configured.
    optional_host_permissions: ['http://*/*', 'https://*/*'],
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
