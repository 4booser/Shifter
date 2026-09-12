import path from 'node:path';
import { defineConfig } from 'vitest/config';

const shared = (...parts: string[]) =>
  path.resolve(import.meta.dirname, '..', 'shared', ...parts);

/*
 * Exact patterns, not prefixes, and ahead of the general '@'.
 *
 * Vite takes the first alias that matches, and a plain '@/lib/mono' would
 * also swallow '@/lib/mono-api' — which stays a web file and knows about
 * fetch. Anchored regexes keep «the shared arithmetic» and «this client's
 * own code around it» apart even though they share a name.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/lib\/mono\/mono$/, replacement: shared('mono', 'mono') },
      { find: /^@\/lib\/mono\/mono-work$/, replacement: shared('mono', 'mono-work') },
      { find: /^@\/lib\/mono\/mono-insights$/, replacement: shared('mono', 'mono-insights') },
      { find: /^@\/lib\/mono\/mono-rules$/, replacement: shared('mono', 'mono-rules') },
      { find: /^@\/lib\/mono\/mono-shape$/, replacement: shared('mono', 'mono-shape') },
      { find: /^@\/lib\/mono\/spend-viz$/, replacement: shared('mono', 'spend-viz') },
      { find: /^@\/lib\/import\/ics$/, replacement: shared('calendar', 'ics') },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
    ],
  },
  test: { include: ['tests/**/*.spec.ts'], environment: 'node', globals: true },
});
