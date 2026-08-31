import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';

import { Toaster } from '@/components/ui/sonner';
import { bindSettingsToDocument } from '@/lib/settings/store';

/**
 * The application root: one query client, one toaster, one outlet.
 *
 * Staleness is generous on purpose — a shift calendar is not a trading
 * screen, and refetching a month every time a tab regains focus is spending
 * somebody's data to tell them what they already see.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 15 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Root() {
  // Subscribed once, here: every theme, accent and size choice is written
  // onto the document root, so plain CSS carries it and no component has to
  // ask what the settings say.
  useEffect(bindSettingsToDocument, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({ component: Root });
