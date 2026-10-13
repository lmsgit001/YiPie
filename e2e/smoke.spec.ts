import path from 'node:path';

import { chromium, expect, test } from '@playwright/test';

// A real Chromium with the built extension loaded. This is the only layer that
// can notice that our understanding of the extension APIs has drifted: every
// other test runs against hand-written doubles.
const EXTENSION_PATH = path.resolve(import.meta.dirname, '../.output/chrome-mv3');

test('the extension loads and a setting survives a round trip through the worker', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  try {
    // The MV3 service worker existing at all is the proof the extension started.
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await expect(page.getByRole('heading', { name: '一瞥 Yipie' })).toBeVisible();

    await page.getByLabel('主题').selectOption('dark');

    // Reload before asserting: the value has to have gone out through the
    // background handler and into storage, not merely lived in React state.
    await page.reload();
    await expect(page.getByLabel('主题')).toHaveValue('dark');
  } finally {
    await context.close();
  }
});
