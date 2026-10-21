import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery, stubApi } from '@/test/render';
import { TopBar } from './top-bar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/employees/12',
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('TopBar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the app mark and name and underlines the current section', () => {
    stubApi({ 'GET /api/auth/me': { email: 'hr@acme.test' } });
    renderWithQuery(<TopBar />);

    const employees = screen.getByRole('link', { name: 'Employees' });
    expect(employees.getAttribute('aria-current')).toBe('page');
    expect(employees.className).toContain('border-primary');
    expect(screen.getByRole('link', { name: 'Insights' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('Salary Management')).toBeDefined();
  });
});
