import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferredResponse } from '@/test/deferred';
import { employeeDetail, peerContext, REFERENCE_ROUTES, salaryPreview } from '@/test/fixtures';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { toInputAmount } from '@/lib/money';
import { SalaryChangeForm } from './salary-change-form';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type Routes = Parameters<typeof stubApi>[0];

function renderForm({
  employee = employeeDetail(),
  routes = {},
}: { employee?: ReturnType<typeof employeeDetail>; routes?: Routes } = {}) {
  const stub = stubApi({
    ...REFERENCE_ROUTES,
    'GET /api/employees/1/peer-context': peerContext(),
    'POST /api/employees/1/salary-changes/preview': salaryPreview(),
    ...routes,
  });
  renderWithQuery(<SalaryChangeForm employee={employee} today="2026-10-19" />);
  return stub;
}

type Calls = ReturnType<typeof stubApi>['calls'];

const isPreview = (call: Calls[number]) => call.url.pathname.endsWith('/preview');
const saveCalls = (calls: Calls) =>
  calls.filter((call) => call.method === 'POST' && call.url.pathname.endsWith('/salary-changes'));
const previewBodies = (calls: Calls) => calls.filter(isPreview).map((call) => call.body);

const amountValue = () => screen.getByLabelText<HTMLInputElement>('New annual salary').value;

function quickLabels() {
  const group = screen.queryByRole('group', { name: 'Quick percentages' });
  return group
    ? within(group)
        .getAllByRole('button')
        .map((button) => button.textContent)
    : [];
}

/** Moves the fake clock, so the comparison debounce fires exactly when the test says. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const COMPARISON_DELAY_MS = 300;
const percentageOf = (init: RequestInit) =>
  (JSON.parse(init.body as string) as { percentageBp?: number }).percentageBp;

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
  beforeEach(() => {
    // Only timers are faked; the clock also ticks on its own so Testing Library's waitFor can poll.
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('defaults the effective date to today and does not allow a later one', () => {
    renderForm();

    const date = screen.getByLabelText<HTMLInputElement>('Effective date');
    expect(date.value).toBe('2026-10-19');
    expect(date.max).toBe('2026-10-19');
    expect(date.min).toBe('2021-04-12');
  });

  it('pre-fills the amount with the current salary', () => {
    renderForm();

    expect(screen.getByLabelText<HTMLInputElement>('New annual salary').value).toBe('5000000.00');
  });

  it('does not accept the pre-filled current amount as a raise', async () => {
    const { calls } = renderForm();

    save();

    expect(await screen.findByText('A raise must be higher than the current salary')).toBeDefined();
    expect(saveCalls(calls)).toEqual([]);
  });

  it('refuses an amount above the largest the system stores', async () => {
    const { calls } = renderForm();

    typeAmount('900000000.01');
    save();

    expect(await screen.findByText(/^Enter an amount up to /)).toBeDefined();
    expect(saveCalls(calls)).toEqual([]);
  });

  it('names the action on the submit button for each reason', () => {
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
    const { calls } = renderForm();

    typeAmount('');
    save();

    expect(await screen.findByText('Enter the new annual salary')).toBeDefined();
    expect(saveCalls(calls)).toEqual([]);
  });

  it('rejects a raise that does not increase pay', async () => {
    const { calls } = renderForm();

    typeAmount('4000000');
    save();

    expect(await screen.findByText('A raise must be higher than the current salary')).toBeDefined();
    expect(saveCalls(calls)).toEqual([]);
  });

  it('sends a raise as an amount in minor units and nothing else', async () => {
    const { calls } = renderForm({
      routes: {
        'POST /api/employees/1/salary-changes': saved,
      },
    });

    typeAmount('5,500,000');
    save();

    await waitFor(() => {
      expect(saveCalls(calls)).toHaveLength(1);
    });
    expect(saveCalls(calls)[0]?.body).toEqual({
      reason: 'raise',
      effectiveDate: '2026-10-19',
      amountMinor: 550_000_000,
    });
  });

  it('lists only levels above the current one for a promotion and requires a choice', async () => {
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
    const { calls } = renderForm({
      routes: {
        'POST /api/employees/1/salary-changes': saved,
      },
    });
    chooseReason('Promotion');
    await screen.findByRole('option', { name: 'L4 · Lead' });
    fireEvent.change(screen.getByLabelText('New level'), { target: { value: '4' } });
    typeAmount('6000000');

    save('Record promotion');

    await waitFor(() => {
      expect(saveCalls(calls)).toHaveLength(1);
    });
    expect(saveCalls(calls)[0]?.body).toEqual({
      reason: 'promotion',
      effectiveDate: '2026-10-19',
      amountMinor: 600_000_000,
      newLevelId: 4,
    });
  });

  it('pre-fills a relocation with the salary converted by the server and says how', async () => {
    const { calls } = renderForm({
      routes: {
        'GET /api/reference/fx/convert': { amountMinor: 5_990_000, currencyCode: 'USD' },
      },
    });
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
    const { calls } = renderForm({
      routes: {
        'GET /api/reference/fx/convert': { amountMinor: 5_990_000, currencyCode: 'USD' },
        'POST /api/employees/1/salary-changes': saved,
      },
    });
    chooseReason('Relocation');
    await screen.findByRole('option', { name: 'United States' });
    fireEvent.change(screen.getByLabelText('New country'), { target: { value: 'US' } });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('New annual salary').value).toBe('59900.00');
    });

    typeAmount('65000');
    save('Record relocation');

    await waitFor(() => {
      expect(saveCalls(calls)).toHaveLength(1);
    });
    expect(saveCalls(calls)[0]?.body).toEqual({
      reason: 'relocation',
      effectiveDate: '2026-10-19',
      amountMinor: 6_500_000,
      newCountryCode: 'US',
    });
  });

  it('does not offer the current country as a relocation destination', async () => {
    renderForm();
    chooseReason('Relocation');
    await screen.findByRole('option', { name: 'United States' });

    const options = within(screen.getByLabelText('New country'))
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(options).toEqual(['Choose a country', 'United States', 'Germany']);
  });

  it('shows the server message when a business rule is broken', async () => {
    renderForm({
      routes: {
        'POST /api/employees/1/salary-changes': apiError(
          422,
          'UNPROCESSABLE',
          'effective date is before the hire date',
        ),
      },
    });
    typeAmount('5500000');

    save();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'effective date is before the hire date',
    );
  });

  it('explains that an inactive employee cannot receive changes instead of showing the form', () => {
    renderForm({ employee: employeeDetail({ status: 'inactive' }) });

    expect(screen.getByText(/Reactivate this employee/)).toBeDefined();
    expect(screen.queryByLabelText('Reason')).toBeNull();
  });
  it('offers quick percentages for a raise and a promotion only', () => {
    renderForm();

    expect(quickLabels()).toEqual(['+3%', '+5%', '+10%', '+15%', 'Custom %']);
    chooseReason('Promotion');
    expect(quickLabels()).toEqual(['+10%', '+15%', '+20%', 'Custom %']);
    chooseReason('Relocation');
    expect(quickLabels()).toEqual([]);
    chooseReason('Correction');
    expect(quickLabels()).toEqual([]);
  });

  it('fills the amount with the figure the server computes for a quick percentage', async () => {
    const { calls } = renderForm({
      routes: {
        'POST /api/employees/1/salary-changes/preview': salaryPreview({
          proposed: { amountMinor: 525_000_000, currencyCode: 'INR', amountBaseMinor: 6_289_500 },
        }),
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '+5%' }));

    await waitFor(() => {
      expect(amountValue()).toBe('5250000.00');
    });
    expect(previewBodies(calls)).toContainEqual({ reason: 'raise', percentageBp: 500 });
    expect(screen.getByRole('button', { name: '+5%' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '+3%' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('sends the chosen level along with a promotion percentage', async () => {
    const { calls } = renderForm();
    chooseReason('Promotion');
    await screen.findByRole('option', { name: 'L4 · Lead' });
    fireEvent.change(screen.getByLabelText('New level'), { target: { value: '4' } });

    fireEvent.click(screen.getByRole('button', { name: '+15%' }));

    await waitFor(() => {
      expect(previewBodies(calls)).toContainEqual({
        reason: 'promotion',
        percentageBp: 1500,
        newLevelId: 4,
      });
    });
  });

  it('keeps the figure for the last quick percentage clicked when answers arrive out of order', async () => {
    const answers = new Map([
      [300, deferredResponse()],
      [1000, deferredResponse()],
    ]);
    renderForm({
      routes: {
        'POST /api/employees/1/salary-changes/preview': (_url, init) => {
          const bp = percentageOf(init);
          return bp === undefined ? Response.json(salaryPreview()) : answers.get(bp)?.promise;
        },
      },
    });
    const proposed = (amountMinor: number) =>
      salaryPreview({ proposed: { amountMinor, currencyCode: 'INR', amountBaseMinor: 0 } });

    fireEvent.click(screen.getByRole('button', { name: '+3%' }));
    fireEvent.click(screen.getByRole('button', { name: '+10%' }));
    await answers.get(1000)?.answer(proposed(550_000_000));
    expect(amountValue()).toBe('5500000.00');

    await answers.get(300)?.answer(proposed(515_000_000));

    expect(amountValue()).toBe('5500000.00');
  });

  it('does not let a quick percentage overwrite an amount typed after the click', async () => {
    const answer = deferredResponse();
    renderForm({
      routes: {
        'POST /api/employees/1/salary-changes/preview': (_url, init) =>
          percentageOf(init) === undefined ? Response.json(salaryPreview()) : answer.promise,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '+10%' }));
    typeAmount('5600000');
    await answer.answer(
      salaryPreview({
        proposed: { amountMinor: 550_000_000, currencyCode: 'INR', amountBaseMinor: 0 },
      }),
    );

    expect(amountValue()).toBe('5600000');
  });

  it('computes a custom percentage on the server', async () => {
    const { calls } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Custom %' }));
    fireEvent.change(screen.getByLabelText('Custom percentage'), { target: { value: '7.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(previewBodies(calls)).toContainEqual({ reason: 'raise', percentageBp: 750 });
    });
  });

  it('asks for a valid percentage without calling the server', async () => {
    const { calls } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Custom %' }));
    fireEvent.change(screen.getByLabelText('Custom percentage'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Enter a percentage from 0.01 to 100')).toBeDefined();
    expect(previewBodies(calls).filter((body) => 'percentageBp' in (body as object))).toEqual([]);
  });

  it('presses Custom when an amount is typed by hand', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '+5%' }));

    typeAmount('5600000');

    expect(screen.getByRole('button', { name: 'Custom %' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: '+5%' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('compares the current and new salary with the change, its percentage and its yearly USD cost', async () => {
    const { calls } = renderForm();

    typeAmount('5500000');
    await advance(COMPARISON_DELAY_MS);
    const box = screen.getByRole('region', { name: 'Comparison' });

    await waitFor(() => {
      expect(within(box).getByText('+₹5,00,000.00 (+10%)')).toBeDefined();
    });
    expect(within(box).getByText('₹50,00,000.00')).toBeDefined();
    expect(within(box).getByText('₹55,00,000.00')).toBeDefined();
    expect(within(box).getByText('+$5,990.00 a year')).toBeDefined();
    expect(within(box).getByText('Still inside the typical range for India L3')).toBeDefined();
    await waitFor(() => {
      expect(previewBodies(calls)).toContainEqual({ reason: 'raise', amountMinor: 550_000_000 });
    });
  });

  it('compares only the amount the user stopped typing', async () => {
    const { calls } = renderForm();

    typeAmount('5500000');
    typeAmount('5600000');
    await advance(COMPARISON_DELAY_MS);

    await waitFor(() => {
      expect(previewBodies(calls)).toContainEqual({ reason: 'raise', amountMinor: 560_000_000 });
    });
    expect(previewBodies(calls)).not.toContainEqual({ reason: 'raise', amountMinor: 550_000_000 });
  });

  it('asks for an amount in the comparison until one parses', () => {
    renderForm();

    typeAmount('');

    const box = screen.getByRole('region', { name: 'Comparison' });
    expect(within(box).getByText('Enter a new amount to compare')).toBeDefined();
    expect(within(box).getByText('₹50,00,000.00')).toBeDefined();
  });

  it("compares a relocation by percentage and USD only, against the new country's peers", async () => {
    const { calls } = renderForm({
      routes: {
        'GET /api/reference/fx/convert': { amountMinor: 6_000_000, currencyCode: 'EUR' },
        'POST /api/employees/1/salary-changes/preview': salaryPreview({
          proposed: { amountMinor: 6_000_000, currencyCode: 'EUR', amountBaseMinor: 6_480_000 },
          changeBaseMinor: 490_000,
          changeBp: 818,
          peer: peerContext({
            countryCode: 'DE',
            currencyCode: 'EUR',
            headcount: 0,
            typical: null,
            position: null,
          }),
        }),
      },
    });
    chooseReason('Relocation');
    await screen.findByRole('option', { name: 'Germany' });
    fireEvent.change(screen.getByLabelText('New country'), { target: { value: 'DE' } });
    await waitFor(() => {
      expect(amountValue()).toBe('60000.00');
    });
    await advance(COMPARISON_DELAY_MS);

    const box = screen.getByRole('region', { name: 'Comparison' });

    await waitFor(() => {
      expect(within(box).getByText('+8.18%')).toBeDefined();
    });
    expect(within(box).getByText('+$4,900.00 a year')).toBeDefined();
    expect(within(box).getByText('Too few Germany L3 peers to show a typical range')).toBeDefined();
    await waitFor(() => {
      expect(previewBodies(calls)).toContainEqual({
        reason: 'relocation',
        amountMinor: 6_000_000,
        newCountryCode: 'DE',
      });
    });
  });

  it("never shows the previous reason's figures under a new reason or country", async () => {
    const relocationAnswer = deferredResponse();
    renderForm({
      routes: {
        'GET /api/reference/fx/convert': { amountMinor: 6_000_000, currencyCode: 'EUR' },
        'POST /api/employees/1/salary-changes/preview': (_url, init) => {
          const body = JSON.parse(init.body as string) as { reason: string };
          return body.reason === 'relocation'
            ? relocationAnswer.promise
            : Response.json(salaryPreview());
        },
      },
    });
    const box = screen.getByRole('region', { name: 'Comparison' });
    await waitFor(() => {
      expect(within(box).getByText('+₹5,00,000.00 (+10%)')).toBeDefined();
    });

    chooseReason('Relocation');
    expect(within(box).queryByText('+₹5,00,000.00 (+10%)')).toBeNull();
    await screen.findByRole('option', { name: 'Germany' });
    fireEvent.change(screen.getByLabelText('New country'), { target: { value: 'DE' } });
    await waitFor(() => {
      expect(amountValue()).toBe('60000.00');
    });
    // The new amount has arrived but the comparison for it has not: nothing from the raise remains.
    expect(within(box).queryByText('+₹5,00,000.00 (+10%)')).toBeNull();
    expect(within(box).getByText('Comparing…')).toBeDefined();
    await advance(COMPARISON_DELAY_MS);
    expect(within(box).queryByText('+₹5,00,000.00 (+10%)')).toBeNull();
    expect(within(box).getByText('Comparing…')).toBeDefined();

    await relocationAnswer.answer(
      salaryPreview({
        proposed: { amountMinor: 6_000_000, currencyCode: 'EUR', amountBaseMinor: 6_480_000 },
        changeBaseMinor: 490_000,
        changeBp: 818,
        peer: peerContext({ countryCode: 'DE', currencyCode: 'EUR' }),
      }),
    );

    expect(within(box).getByText('+8.18%')).toBeDefined();
  });

  it('does not report a failed comparison from the previous reason while the new one is pending', async () => {
    const correctionAnswer = deferredResponse();
    renderForm({
      routes: {
        'POST /api/employees/1/salary-changes/preview': (_url, init) => {
          const body = JSON.parse(init.body as string) as { reason: string };
          return body.reason === 'correction'
            ? correctionAnswer.promise
            : apiError(500, 'INTERNAL', 'boom');
        },
      },
    });
    const box = screen.getByRole('region', { name: 'Comparison' });
    await waitFor(() => {
      expect(within(box).getByText('Could not compare this change')).toBeDefined();
    });

    chooseReason('Correction');

    expect(within(box).queryByText('Could not compare this change')).toBeNull();
    expect(within(box).getByText('Comparing…')).toBeDefined();
    await advance(COMPARISON_DELAY_MS);
    expect(within(box).getByText('Comparing…')).toBeDefined();
    await correctionAnswer.answer(salaryPreview());
    expect(within(box).getByText('+₹5,00,000.00 (+10%)')).toBeDefined();
  });

  it('does not request a comparison for an amount that does not parse or a relocation without a country', async () => {
    const { calls } = renderForm();
    await waitFor(() => {
      expect(previewBodies(calls)).toHaveLength(1);
    });

    typeAmount('abc');
    await advance(COMPARISON_DELAY_MS * 2);
    chooseReason('Relocation');
    await advance(COMPARISON_DELAY_MS * 2);

    expect(previewBodies(calls)).toEqual([{ reason: 'raise', amountMinor: 500_000_000 }]);
  });

  describe('a late quick percentage', () => {
    function renderSlowQuick() {
      const answer = deferredResponse();
      renderForm({
        routes: {
          'POST /api/employees/1/salary-changes/preview': (_url, init) =>
            percentageOf(init) === undefined ? Response.json(salaryPreview()) : answer.promise,
        },
      });
      return {
        lateAnswer: () =>
          answer.answer(
            salaryPreview({
              proposed: { amountMinor: 525_000_000, currencyCode: 'INR', amountBaseMinor: 0 },
            }),
          ),
      };
    }

    it('is dropped after the reason changes', async () => {
      const { lateAnswer } = renderSlowQuick();

      fireEvent.click(screen.getByRole('button', { name: '+5%' }));
      chooseReason('Correction');
      await lateAnswer();

      expect(amountValue()).toBe('5000000.00');
    });

    it('is dropped once Custom % is pressed', async () => {
      const { lateAnswer } = renderSlowQuick();

      fireEvent.click(screen.getByRole('button', { name: '+5%' }));
      fireEvent.click(screen.getByRole('button', { name: 'Custom %' }));
      await lateAnswer();

      expect(amountValue()).toBe('5000000.00');
      expect(screen.getByRole('button', { name: '+5%' }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    });
  });

  it('leaves no quick percentage pressed when the server cannot work it out', async () => {
    renderForm({
      routes: {
        'POST /api/employees/1/salary-changes/preview': (_url, init) => {
          const body = JSON.parse(init.body as string) as { percentageBp?: number };
          return body.percentageBp === undefined
            ? Response.json(salaryPreview())
            : apiError(500, 'INTERNAL', 'boom');
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '+5%' }));

    expect(await screen.findByText(/Could not work out that percentage/)).toBeDefined();
    expect(screen.getByRole('button', { name: '+5%' }).getAttribute('aria-pressed')).toBe('false');
    expect(amountValue()).toBe('5000000.00');
  });

  it('clears the percentage error once the percentage is edited', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Custom %' }));
    fireEvent.change(screen.getByLabelText('Custom percentage'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByText('Enter a percentage from 0.01 to 100');

    fireEvent.change(screen.getByLabelText('Custom percentage'), { target: { value: '5' } });

    expect(screen.queryByText('Enter a percentage from 0.01 to 100')).toBeNull();
  });

  describe('a late currency conversion', () => {
    function renderSlowConversion() {
      const answer = deferredResponse();
      renderForm({ routes: { 'GET /api/reference/fx/convert': () => answer.promise } });
      chooseReason('Relocation');
      return {
        lateAnswer: () => answer.answer({ amountMinor: 5_990_000, currencyCode: 'USD' }),
      };
    }

    async function chooseUnitedStates() {
      await screen.findByRole('option', { name: 'United States' });
      fireEvent.change(screen.getByLabelText('New country'), { target: { value: 'US' } });
    }

    it('does not overwrite the amount after the reason changes', async () => {
      const { lateAnswer } = renderSlowConversion();
      await chooseUnitedStates();

      chooseReason('Correction');
      await lateAnswer();

      expect(amountValue()).toBe('5000000.00');
      expect(screen.queryByText(/Converted at FX rate/)).toBeNull();
    });

    it('does not overwrite the amount after a reset', async () => {
      const { lateAnswer } = renderSlowConversion();
      await chooseUnitedStates();

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      await lateAnswer();

      expect(amountValue()).toBe('5000000.00');
    });

    it('does not fill the amount after the country is cleared', async () => {
      const { lateAnswer } = renderSlowConversion();
      await chooseUnitedStates();

      fireEvent.change(screen.getByLabelText('New country'), { target: { value: '' } });
      await lateAnswer();

      expect(amountValue()).toBe('');
      expect(screen.queryByText(/Converted at FX rate/)).toBeNull();
    });
  });

  it('starts again from the salary the server returned after a save', async () => {
    const returned = employeeDetail({
      salary: {
        amountMinor: 560_000_000,
        currencyCode: 'INR',
        amountBaseMinor: 6_708_800,
        effectiveDate: '2026-10-19',
      },
    });
    renderForm({
      routes: {
        'POST /api/employees/1/salary-changes': () => Response.json(returned, { status: 201 }),
      },
    });
    typeAmount('5500000');

    save();

    await waitFor(() => {
      expect(amountValue()).toBe(
        toInputAmount(returned.salary.amountMinor, returned.salary.currencyCode),
      );
    });
  });
});
