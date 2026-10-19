import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { employeeDetail, REFERENCE_ROUTES } from '@/test/fixtures';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { SalaryChangeForm } from './salary-change-form';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderForm(employee = employeeDetail()) {
  return renderWithQuery(<SalaryChangeForm employee={employee} today="2026-10-19" />);
}

function chooseReason(label: string) {
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: label } });
}

function typeAmount(value: string) {
  fireEvent.change(screen.getByLabelText('New annual salary'), { target: { value } });
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Record change' }));
}

const saved = () => Response.json(employeeDetail(), { status: 201 });

describe('SalaryChangeForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults the effective date to today and does not allow a later one', () => {
    stubApi(REFERENCE_ROUTES);
    renderForm();

    const date = screen.getByLabelText<HTMLInputElement>('Effective date');
    expect(date.value).toBe('2026-10-19');
    expect(date.max).toBe('2026-10-19');
    expect(date.min).toBe('2021-04-12');
  });

  it('asks for an amount without calling the server when it is missing', async () => {
    const { calls } = stubApi(REFERENCE_ROUTES);
    renderForm();

    save();

    expect(await screen.findByText('Enter the new annual salary')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('rejects a raise that does not increase pay', async () => {
    const { calls } = stubApi(REFERENCE_ROUTES);
    renderForm();

    typeAmount('4000000');
    save();

    expect(await screen.findByText('A raise must be higher than the current salary')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('sends a raise as an amount in minor units and nothing else', async () => {
    const { calls } = stubApi({
      ...REFERENCE_ROUTES,
      'POST /api/employees/1/salary-changes': saved,
    });
    renderForm();

    typeAmount('5,500,000');
    save();

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      reason: 'raise',
      effectiveDate: '2026-10-19',
      amountMinor: 550_000_000,
    });
  });

  it('lists only levels above the current one for a promotion and requires a choice', async () => {
    stubApi(REFERENCE_ROUTES);
    renderForm();

    chooseReason('promotion');
    await screen.findByRole('option', { name: 'L4 · Lead' });

    const level = screen.getByLabelText('New level');
    const options = within(level)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['Choose a level', 'L4 · Lead']);

    typeAmount('6000000');
    save();
    expect(await screen.findByText('Choose the new level')).toBeDefined();
  });

  it('sends a promotion with the new level', async () => {
    const { calls } = stubApi({
      ...REFERENCE_ROUTES,
      'POST /api/employees/1/salary-changes': saved,
    });
    renderForm();
    chooseReason('promotion');
    await screen.findByRole('option', { name: 'L4 · Lead' });
    fireEvent.change(screen.getByLabelText('New level'), { target: { value: '4' } });
    typeAmount('6000000');

    save();

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      reason: 'promotion',
      effectiveDate: '2026-10-19',
      amountMinor: 600_000_000,
      newLevelId: 4,
    });
  });

  it('pre-fills a relocation with the salary converted by the server and says how', async () => {
    const { calls } = stubApi({
      ...REFERENCE_ROUTES,
      'GET /api/reference/fx/convert': { amountMinor: 5_990_000, currencyCode: 'USD' },
    });
    renderForm();
    chooseReason('relocation');
    await screen.findByRole('option', { name: 'United States' });

    fireEvent.change(screen.getByLabelText('New country'), { target: { value: 'US' } });

    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('New annual salary').value).toBe('59900.00');
    });
    const convert = calls.find((call) => call.url.pathname === '/api/reference/fx/convert');
    expect(Object.fromEntries(convert?.url.searchParams ?? [])).toEqual({
      amountMinor: '500000000',
      from: 'INR',
      to: 'USD',
    });
    expect(
      screen.getByText('Converted at FX rate as of 15 Jan 2026 — adjust if needed'),
    ).toBeDefined();
    expect(screen.getByText('USD')).toBeDefined();
  });

  it('sends a relocation with the amount the user adjusted it to', async () => {
    const { calls } = stubApi({
      ...REFERENCE_ROUTES,
      'GET /api/reference/fx/convert': { amountMinor: 5_990_000, currencyCode: 'USD' },
      'POST /api/employees/1/salary-changes': saved,
    });
    renderForm();
    chooseReason('relocation');
    await screen.findByRole('option', { name: 'United States' });
    fireEvent.change(screen.getByLabelText('New country'), { target: { value: 'US' } });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('New annual salary').value).toBe('59900.00');
    });

    typeAmount('65000');
    save();

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      reason: 'relocation',
      effectiveDate: '2026-10-19',
      amountMinor: 6_500_000,
      newCountryCode: 'US',
    });
  });

  it('does not offer the current country as a relocation destination', async () => {
    stubApi(REFERENCE_ROUTES);
    renderForm();
    chooseReason('relocation');
    await screen.findByRole('option', { name: 'United States' });

    const options = within(screen.getByLabelText('New country'))
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(options).toEqual(['Choose a country', 'United States', 'Germany']);
  });

  it('shows the server message when a business rule is broken', async () => {
    stubApi({
      ...REFERENCE_ROUTES,
      'POST /api/employees/1/salary-changes': apiError(
        422,
        'UNPROCESSABLE',
        'effective date is before the hire date',
      ),
    });
    renderForm();
    typeAmount('5500000');

    save();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'effective date is before the hire date',
    );
  });

  it('explains that an inactive employee cannot receive changes instead of showing the form', () => {
    stubApi(REFERENCE_ROUTES);
    renderForm(employeeDetail({ status: 'inactive' }));

    expect(screen.getByText(/Reactivate this employee/)).toBeDefined();
    expect(screen.queryByLabelText('Reason')).toBeNull();
  });
});
