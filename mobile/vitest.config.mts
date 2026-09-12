import path from 'node:path';
import { defineConfig } from 'vitest/config';

const shared = (...parts: string[]) =>
  path.resolve(import.meta.dirname, '..', 'shared', ...parts);

/**
 * The phone had no automated check beyond a typecheck, which leaves every
 * date bug to be found by somebody looking at a calendar and counting.
 * Only the pure helpers run here — anything that renders needs a device.
 *
 * The anchored patterns come first for the same reason as on the web: a
 * prefix alias on '@/lib/mono' would drag '@/lib/mono-api' out of this
 * project and into the shared folder, where fetch does not belong.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/lib\/mono$/, replacement: shared('mono', 'mono') },
      { find: /^@\/lib\/mono-work$/, replacement: shared('mono', 'mono-work') },
      { find: /^@\/lib\/mono-insights$/, replacement: shared('mono', 'mono-insights') },
      { find: /^@\/lib\/mono-rules$/, replacement: shared('mono', 'mono-rules') },
      { find: /^@\/lib\/mono-shape$/, replacement: shared('mono', 'mono-shape') },
      { find: /^@\/lib\/spend-viz$/, replacement: shared('mono', 'spend-viz') },
      { find: /^@\/lib\/ics$/, replacement: shared('calendar', 'ics') },
      // The language is read out of the keychain at module load; in node that
      // would pull React Native's Flow source into a parser that cannot read it.
      {
        find: 'expo-secure-store',
        replacement: path.resolve(import.meta.dirname, 'tests/stubs/secure-store.ts'),
      },
      {
        find: 'expo-notifications',
        replacement: path.resolve(import.meta.dirname, 'tests/stubs/notifications.ts'),
      },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
    ],
  },
  test: { include: ['tests/**/*.spec.ts'], environment: 'node', globals: true },
});
