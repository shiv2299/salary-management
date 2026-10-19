import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { AuthGuard } from './auth-guard';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

describe('AuthGuard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockClear();
  });

  it('sends a visitor without a session to the login page and shows no protected content', async () => {
    stubApi({ 'GET /api/auth/me': apiError(401, 'UNAUTHENTICATED', 'Authentication required') });

    renderWithQuery(<AuthGuard>secret numbers</AuthGuard>);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByText('secret numbers')).toBeNull();
  });

  it('shows the page once the session is confirmed', async () => {
    stubApi({ 'GET /api/auth/me': { email: 'hr@acme.test' } });

    renderWithQuery(<AuthGuard>secret numbers</AuthGuard>);

    expect(await screen.findByText('secret numbers')).toBeDefined();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows an error with a retry instead of the login page when the server is unreachable', async () => {
    stubApi({ 'GET /api/auth/me': apiError(500, 'INTERNAL_ERROR', 'Internal server error') });

    renderWithQuery(<AuthGuard>secret numbers</AuthGuard>);

    expect((await screen.findByRole('alert')).textContent).toContain('Internal server error');
    expect(replace).not.toHaveBeenCalled();
  });
});
