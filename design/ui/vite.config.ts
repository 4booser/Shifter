import path from 'node:path';

import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Макет интерфейса — отдельный проект.
 *
 * Здесь нет ни запросов, ни хранилищ, ни логики: только экраны и то, из чего
 * они собраны. Данные лежат рядом в `mock/` и никуда не ходят. Это макет,
 * который можно кликать, а не приложение.
 */
export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5300, strictPort: true },
});
