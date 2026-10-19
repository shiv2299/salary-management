'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';

/** A session that expires mid-use sends the user back to the login page, from any request. */
function redirectWhenSessionExpired(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && window.location.pathname !== '/login') {
    // A full reload on purpose: it drops every cached query along with the dead session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: redirectWhenSessionExpired }),
        mutationCache: new MutationCache({ onError: redirectWhenSessionExpired }),
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
