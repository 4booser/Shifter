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
  /**
   * The new front is served alongside the old one rather than instead of it:
   * the shipping client is still `web/`, and this can be looked at on the
   * real server without anybody losing a screen that has not moved across
   * yet. Dev runs under the same prefix so the two cannot drift.
   */
  base: '/next/',
  plugins: [
    // Before react(), as the router plugin asks.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5210,
    // The API is the same server the Next app is served from; in development
    // it lives next door, so the paths stay origin-relative in the code.
    proxy: { '/shifter': { target: 'http://localhost:5208', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
