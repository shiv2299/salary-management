import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;
type Route = Handler | Response | Record<string, unknown>;

/**
 * Stubs fetch with route handlers matched in order on "METHOD /path". A handler returns a Response,
 * or undefined to fall through to the next one. Unmatched requests fail the test loudly.
 */
export function stubApi(routes: Record<string, Route>) {
  const calls: { method: string; url: URL; body: unknown }[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const method = init.method ?? 'GET';
    calls.push({
      method,
      url,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    });
    for (const [key, handler] of Object.entries(routes)) {
      if (key !== `${method} ${url.pathname}`) continue;
      if (handler instanceof Response) return Promise.resolve(handler.clone());
      if (typeof handler === 'function') {
        const result: Response | Promise<Response> | undefined = handler(url, init);
        if (result !== undefined) return Promise.resolve(result);
        continue;
      }
      return Promise.resolve(Response.json(handler));
    }
    return Promise.reject(new Error(`Unstubbed request: ${method} ${url.pathname}${url.search}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
