import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthStatus } from './health-status';

function renderHealthStatus() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <HealthStatus />
    </QueryClientProvider>,
  );
}

function stubFetch(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

describe('HealthStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading indicator while the request is pending', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));

    renderHealthStatus();

    expect(screen.getByRole('status').textContent).toBe('Checking API health');
  });

  it('shows ok when the API and database are healthy', async () => {
    stubFetch(Response.json({ status: 'ok', database: 'ok' }));

    renderHealthStatus();

    expect(await screen.findByText('ok')).toBeDefined();
    expect(screen.getByText('Database: ok')).toBeDefined();
  });

  it('shows the API error message when the request fails', async () => {
    stubFetch(
      Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
        { status: 500 },
      ),
    );

    renderHealthStatus();

    expect((await screen.findByRole('alert')).textContent).toContain('Internal server error');
  });

  it('shows an unreachable state when the network request throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    renderHealthStatus();

    expect((await screen.findByRole('alert')).textContent).toContain('Could not reach the server');
  });
});
