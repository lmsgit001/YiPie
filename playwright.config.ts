import { defineConfig } from '@playwright/test';

// Real-browser end-to-end tests: Playwright launches Chromium with the built
// extension loaded from `.output/chrome-mv3`. This is the only layer that can
// catch a drift between our hand-written `wxt/browser` test doubles and the
// real extension APIs (message routing, port streaming, shadow-root mounting).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
  },
});
