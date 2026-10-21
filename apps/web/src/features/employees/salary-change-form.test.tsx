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
  fireEvent.click(screen.getByRole('radio', { name: label }));
}

function typeAmount(value: string) {
  fireEvent.change(screen.getByLabelText('New annual salary'), { target: { value } });
}

function save(label = 'Record raise') {
  fireEvent.click(screen.getByRole('button', { name: label }));
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

  it('pre-fills the amount with the current salary', () => {
    stubApi(REFERENCE_ROUTES);
    renderForm();

    expect(screen.getByLabelText<HTMLInputElement>('New annual salary').value).toBe('5000000.00');
  });

  it('does not accept the pre-filled current amount as a raise', async () => {
    const { calls } = stubApi(REFERENCE_ROUTES);
    renderForm();

    save();

    expect(await screen.findByText('A raise must be higher than the current salary')).toBeDefined();
    expect(
      calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/salary-changes')),
    ).toBe(false);
  });

  it('names the action on the submit button for each reason', () => {
    stubApi(REFERENCE_ROUTES);
    renderForm();

    for (const [reason, label] of [
      ['Promotion', 'Record promotion'],
      ['Relocation', 'Record relocation'],
      ['Correction', 'Record correction'],
      ['Raise', 'Record raise'],
    ]) {
      chooseReason(reason as string);
      expect(screen.getByRole('button', { name: label })).toBeDefined();
    }
  });

  it('pre-fills the amount again after every reason change and leaves a relocation empty', () => {
    stubApi(REFERENCE_ROUTES);
    renderForm();
    const amount = () => screen.getByLabelText<HTMLInputElement>('New annual salary').value;

    typeAmount('6000000');
    chooseReason('Correction');
    expect(amount()).toBe('5000000.00');
    chooseReason('Relocation');
    expect(amount()).toBe('');
    chooseReason('Promotion');
    expect(amount()).toBe('5000000.00');
  });

  it('resets every field to its starting values', () => {
    stubApi(REFERENCE_ROUTES);
    renderForm();
    chooseReason('Promotion');
    typeAmount('6000000');
    fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '2026-01-01' } });

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByRole('radio', { name: 'Raise' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText<HTMLInputElement>('New annual salary').value).toBe('5000000.00');
    expect(screen.getByLabelText<HTMLInputElement>('Effective date').value).toBe('2026-10-19');
  });

  it('asks for an amount without calling the server when it is missing', async () => {
    const { calls } = stubApi(REFERENCE_ROUTES);
    renderForm();

    typeAmount('');
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

    chooseReason('Promotion');
    await screen.findByRole('option', { name: 'L4 · Lead' });

    const level = screen.getByLabelText('New level');
    const options = within(level)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['Choose a level', 'L4 · Lead']);

    typeAmount('6000000');
    save('Record promotion');
    expect(await screen.findByText('Choose the new level')).toBeDefined();
  });

  it('sends a promotion with the new level', async () => {
    const { calls } = stubApi({
      ...REFERENCE_ROUTES,
      'POST /api/employees/1/salary-changes': saved,
    });
    renderForm();
    chooseReason('Promotion');
    await screen.findByRole('option', { name: 'L4 · Lead' });
    fireEvent.change(screen.getByLabelText('New level'), { target: { value: '4' } });
    typeAmount('6000000');

    save('Record promotion');

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
    chooseReason('Relocation');
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
    chooseReason('Relocation');
    await screen.findByRole('option', { name: 'United States' });
    fireEvent.change(screen.getByLabelText('New country'), { target: { value: 'US' } });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('New annual salary').value).toBe('59900.00');
    });

    typeAmount('65000');
    save('Record relocation');

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
    chooseReason('Relocation');
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
