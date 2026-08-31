import path from 'node:path';

import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The new front end: Vite, React 19, TanStack Router (file-based) and Query,
 * Tailwind v4 and shadcn/ui. It is built beside the Next.js app rather than
 * over it — main deploys straight to production, and a half-ported screen is
 * not something a person on a shift should meet.
 */
export default defineConfig({
  plugins: [
    // Before react(), as the router plugin asks.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: { port: 5210 },
  build: { outDir: 'dist', sourcemap: false },
});
