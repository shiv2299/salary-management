import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { employeeDetail, REFERENCE_ROUTES } from '@/test/fixtures';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { EmployeeForm } from './employee-form';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function fillValidForm() {
  await screen.findByRole('option', { name: 'Germany' });
  fill('First name', 'Lena');
  fill('Last name', 'Fischer');
  fill('Email', ' Lena.Fischer@Acme.test ');
  fill('Country', 'DE');
  fill('Department', '2');
  fill('Level', '3');
  fill('Job title', 'Account Executive');
  fill('Starting annual salary', '72,000.50');
}

function renderForm(onCreated = vi.fn()) {
  renderWithQuery(<EmployeeForm today="2026-10-19" onCreated={onCreated} />);
  return onCreated;
}

describe('EmployeeForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for every required field without calling the server', async () => {
    const { calls } = stubApi(REFERENCE_ROUTES);
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));

    expect(await screen.findByText('Enter a first name')).toBeDefined();
    expect(screen.getByText('Enter a last name')).toBeDefined();
    expect(screen.getByText('Enter a valid email address')).toBeDefined();
    expect(screen.getByText('Country is required')).toBeDefined();
    expect(screen.getByText('Enter the starting annual salary')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('creates the employee with the salary in the minor units of the chosen country currency', async () => {
    const { calls } = stubApi({
      ...REFERENCE_ROUTES,
      'POST /api/employees': () => Response.json(employeeDetail({ id: 9 }), { status: 201 }),
    });
    const onCreated = renderForm();
    await fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(9);
    });
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      firstName: 'Lena',
      lastName: 'Fischer',
      email: 'lena.fischer@acme.test',
      countryCode: 'DE',
      departmentId: 2,
      levelId: 3,
      jobTitle: 'Account Executive',
      hireDate: '2026-10-19',
      amountMinor: 7_200_050,
    });
  });

  it('shows the currency of the chosen country next to the salary', async () => {
    stubApi(REFERENCE_ROUTES);
    renderForm();
    await screen.findByRole('option', { name: 'Germany' });

    fill('Country', 'DE');

    expect(screen.getByText('EUR')).toBeDefined();
  });

  it('reports a duplicate email on the email field', async () => {
    stubApi({
      ...REFERENCE_ROUTES,
      'POST /api/employees': apiError(
        409,
        'CONFLICT',
        'An employee with this email already exists',
      ),
    });
    renderForm();
    await fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create employee' }));

    expect(await screen.findByText('An employee with this email already exists')).toBeDefined();
  });
});
