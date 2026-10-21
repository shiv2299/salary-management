import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { LoginForm } from './login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockClear();
  });

  it('asks for both fields without calling the server when they are empty', async () => {
    const { fetchMock } = stubApi({});
    renderWithQuery(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email')).toBeDefined();
    expect(screen.getByText('Enter your password')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('goes to the insights page after a successful sign in', async () => {
    const { calls } = stubApi({ 'POST /api/auth/login': { email: 'hr@acme.test' } });
    renderWithQuery(<LoginForm />);

    fillAndSubmit('hr@acme.test', 'secret');

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/insights');
    });
    expect(calls[0]?.body).toEqual({ email: 'hr@acme.test', password: 'secret' });
  });

  it('shows the server message and stays on the page when the credentials are wrong', async () => {
    stubApi({
      'POST /api/auth/login': apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
    });
    renderWithQuery(<LoginForm />);

    fillAndSubmit('hr@acme.test', 'wrong');

    expect((await screen.findByRole('alert')).textContent).toContain('Invalid email or password');
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows and hides the password', () => {
    renderWithQuery(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText<HTMLInputElement>('Password').type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText<HTMLInputElement>('Password').type).toBe('password');
  });
});
