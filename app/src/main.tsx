import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';
import './index.css';

// The prefix comes from Vite rather than a literal, so moving the app is a
// one-line change in one file and the router cannot disagree with the asset
// paths about where it lives.
const basepath = import.meta.env.BASE_URL.replace(/\/$/, '');

const router = createRouter({ routeTree, defaultPreload: 'intent', basepath });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
