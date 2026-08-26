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
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
