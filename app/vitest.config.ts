import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Node environment on purpose: what is worth pinning here is arithmetic and
 * wording — streaks, date spans, the shape of a day being saved — none of
 * which needs a DOM. The screens are checked by driving a real browser.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { include: ['tests/**/*.spec.ts'], environment: 'node', globals: true },
});
