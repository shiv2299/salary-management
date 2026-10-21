import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '@/test/render';
import { LoginScreen } from './login-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

describe('LoginScreen', () => {
  it('shows only the app name on the brand panel, with no pitch copy', () => {
    renderWithQuery(<LoginScreen />);

    const panel = screen.getByRole('complementary', { name: 'Salary Management' });
    expect(panel.textContent?.trim()).toBe('Salary Management');
    expect(within(panel).queryAllByRole('heading')).toHaveLength(0);
  });

  it('asks the user to sign in and says how long a session lasts', () => {
    renderWithQuery(<LoginScreen />);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeDefined();
    expect(screen.getByText('Use your work email and password.')).toBeDefined();
    expect(screen.getByText('Sessions last a working day.')).toBeDefined();
  });
});
