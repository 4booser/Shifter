import { defineConfig } from '@playwright/test';

/**
 * End-to-end against the real thing: the ASP.NET server serving the built
 * SPA and talking to a real Postgres — the same shape production has. No
 * next dev, no mocks; if these pass, the release works.
 */
export default defineConfig({
  testDir: './e2e',
  // One worker on purpose: the specs share a freshly registered account.
  workers: 1,
  timeout: 45_000,
  retries: process.env['CI'] ? 1 : 0,
  use: {
    baseURL: process.env['E2E_BASE'] ?? 'http://localhost:5208',
    trace: 'retain-on-failure',
    locale: 'en-GB',
    /*
     * The browser's own language, not just the page's.
     *
     * A native <input type="time"> draws itself in Chromium's UI locale and
     * ignores the context locale entirely. Headless defaults to American, so
     * a screenshot showed «04:05» for a shift that started at 16:05 — the
     * value in the DOM was right the whole time. A baseline that lies about
     * the app is worse than no baseline: the next person reads it as a bug
     * and goes looking for a fault that is not there. This one nearly did.
     */
    launchOptions: { args: ['--lang=en-GB'] },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
