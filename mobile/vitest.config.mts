import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * The phone had no automated check beyond a typecheck, which leaves every
 * date bug to be found by somebody looking at a calendar and counting.
 * Only the pure helpers run here — anything that renders needs a device.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // The language is read out of the keychain at module load; in node that
      // would pull React Native's Flow source into a parser that cannot read it.
      'expo-secure-store': path.resolve(import.meta.dirname, 'tests/stubs/secure-store.ts'),
    },
  },
  test: { include: ['tests/**/*.spec.ts'], environment: 'node', globals: true },
});
