import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkPreviewItem, bulkSummary, REFERENCE_ROUTES } from '@/test/fixtures';
import { deferredResponse } from '@/test/deferred';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { BulkRevisionPage } from './bulk-revision-page';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

function stubBulk(routes: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    ...REFERENCE_ROUTES,
    'GET /api/employees/bulk-salary-changes/latest': { latest: null },
    'POST /api/employees/bulk-salary-changes/summary': (_, init) =>
      Response.json(
        (JSON.parse(init.body as string) as { percentageBp?: number }).percentageBp === undefined
          ? bulkSummary({ revision: null })
          : bulkSummary(),
      ),
    'POST /api/employees/bulk-salary-changes/preview': {
      items: [
        bulkPreviewItem(),
        bulkPreviewItem({
          employeeId: 2,
          firstName: 'Ravi',
          lastName: 'Menon',
          outsidePeerRange: 'above',
        }),
      ],
      total: 2,
    },
    ...routes,
  });
}

const render = () => renderWithQuery(<BulkRevisionPage today="2026-10-19" />);

const choose = (percentage: string) => {
  fireEvent.change(screen.getByLabelText('Percentage increase'), { target: { value: percentage } });
};
const SUMMARY = 'POST /api/employees/bulk-salary-changes/summary';
const PREVIEW = 'POST /api/employees/bulk-salary-changes/preview';
const WAIT = { timeout: 3000 };

describe('BulkRevisionPage setup', () => {
  beforeEach(() => {
    search = 'ids=1,2';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a hand-picked selection from the address and shows who it covers', async () => {
    search = 'country=US&ids=1,2';
    const { calls } = stubBulk();
    render();
    expect(await screen.findByText('2 people, active only')).toBeDefined();
    expect(calls.find((c) => c.url.pathname.endsWith('/summary'))?.body).toEqual({
      employeeIds: [1, 2],
    });
    expect(screen.getByText('United States')).toBeDefined();
    expect(screen.getByText('Picked by hand from this list.')).toBeDefined();
    expect(
      within(screen.getByRole('list', { name: 'By department' })).getByText('Engineering'),
    ).toBeDefined();
  });

  it('covers everyone matching the list when it selected all matching', async () => {
    search = 'country=US&level=3&search=ann&select=all';
    const { calls } = stubBulk();
    render();
    await screen.findByText('2 people, active only');
    expect(calls.find((c) => c.url.pathname.endsWith('/summary'))?.body).toEqual({
      filter: { search: 'ann', country: ['US'], level: [3] },
    });
    expect(screen.getByText('Search: ann')).toBeDefined();
  });

  it('links back to the employees list with its filters', () => {
    search = 'country=US&page=2&select=all';
    stubBulk();
    render();
    expect(screen.getByRole('link', { name: 'Back to employees' }).getAttribute('href')).toBe(
      '/employees?country=US&page=2',
    );
  });

  it('says no one is selected when the address carries no valid selection', async () => {
    search = 'ids=abc';
    const { calls } = stubBulk();
    render();
    expect(await screen.findByText('No one is selected for this revision.')).toBeDefined();
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('shows the second step as the current one', () => {
    stubBulk();
    render();
    expect(
      within(screen.getByRole('list', { name: 'Progress' }))
        .getByText('Set increase & review')
        .closest('li')
        ?.getAttribute('aria-current'),
    ).toBe('step');
  });

  it('reminds the user of the last bulk revision', async () => {
    stubBulk({
      'GET /api/employees/bulk-salary-changes/latest': {
        latest: {
          batchId: 9,
          effectiveDate: '2026-04-01',
          percentageBp: 400,
          employeeCount: 1233,
          note: 'Annual increment 2026',
        },
      },
    });
    render();
    expect(await screen.findByText('1 Apr 2026 · 4% · 1,233 people')).toBeDefined();
    expect(screen.getByText('Annual increment 2026')).toBeDefined();
  });

  it('fills the note from the selection and never overwrites a typed note', async () => {
    search = 'level=3&country=US&select=all';
    stubBulk();
    render();
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Note').value).toBe('L3, United States');
    });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Spring cycle' } });
    expect(screen.getByLabelText<HTMLInputElement>('Note').value).toBe('Spring cycle');
  });

  it('fills the percentage from a quick button and previews it', async () => {
    const { calls } = stubBulk();
    render();
    fireEvent.click(screen.getByRole('button', { name: '5%' }));
    expect(screen.getByLabelText<HTMLInputElement>('Percentage increase').value).toBe('5');
    expect(screen.getByRole('button', { name: '5%' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => {
      expect(calls.find((c) => c.url.pathname.endsWith('/preview'))?.body).toEqual({
        employeeIds: [1, 2],
        percentageBp: 500,
      });
    });
  });

  it('asks for a valid percentage and an effective date that is not in the future', async () => {
    stubBulk();
    render();
    fireEvent.change(screen.getByLabelText('Percentage increase'), { target: { value: 'abc' } });
    expect(
      await screen.findByText('Enter a percentage between 0.01 and 100, with at most two decimals'),
    ).toBeDefined();
    fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '2026-10-20' } });
    expect(screen.getByText('Effective date cannot be in the future')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '' } });
    expect(screen.getByText('Choose an effective date')).toBeDefined();
  });
});

describe('BulkRevisionPage review', () => {
  beforeEach(() => {
    search = 'ids=1,2';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows nothing to review until a percentage is chosen', async () => {
    stubBulk();
    render();
    expect(await screen.findByText('Choose an increase to see the review.')).toBeDefined();
  });

  it('shows the headline figures from the server summary', async () => {
    stubBulk();
    render();
    choose('7');
    const tile = async (name: string) => within(await screen.findByRole('group', { name }, WAIT));
    expect((await tile('Added to annual payroll')).getByText('+$14,000.00')).toBeDefined();
    expect((await tile('Typical pay')).getByText('up from $100,000.00 · median')).toBeDefined();
    expect((await tile('Rows overridden')).getByText('of 2')).toBeDefined();
    expect((await tile('Outside peer range')).getByText('1')).toBeDefined();
  });

  it('shows the USD total with each currency for a mixed selection, with the FX date', async () => {
    stubBulk({
      [SUMMARY]: bulkSummary({
        revision: {
          ...bulkSummary().revision!,
          addedByCurrency: [
            { currencyCode: 'INR', addedMinor: 35_000_000 },
            { currencyCode: 'USD', addedMinor: 1_700_000 },
          ],
          addedBaseMinor: 2_119_300,
        },
      }),
      [PREVIEW]: {
        items: [
          bulkPreviewItem(),
          bulkPreviewItem({
            employeeId: 2,
            firstName: 'Ravi',
            lastName: 'Menon',
            countryCode: 'IN',
            currencyCode: 'INR',
            currentAmountMinor: 500_000_000,
            proposedAmountMinor: 535_000_000,
          }),
        ],
        total: 2,
      },
    });
    render();
    choose('7');
    expect(await screen.findByText('+$21,193.00', {}, WAIT)).toBeDefined();
    expect(screen.getByText('+₹3,50,000.00 · +$17,000.00')).toBeDefined();
    expect(screen.getByText('FX rates as of 15 Jan 2026')).toBeDefined();
  });

  it('formats the new salary, marks an edit and undoes it', async () => {
    stubBulk();
    render();
    choose('7');
    const cell = await screen.findByLabelText<HTMLInputElement>(
      'New salary for Ravi Menon',
      {},
      WAIT,
    );
    expect(cell.value).toBe('107,000.00');
    fireEvent.change(cell, { target: { value: '110000' } });
    fireEvent.blur(cell);
    expect(cell.value).toBe('110,000.00');
    expect(cell.getAttribute('data-overridden')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Undo edit for Ravi Menon' }));
    expect(cell.value).toBe('107,000.00');
    expect(cell.getAttribute('data-overridden')).toBeNull();
  });

  it('stops counting an edit typed back to the proposed amount', async () => {
    stubBulk();
    render();
    choose('7');
    const cell = await screen.findByLabelText<HTMLInputElement>(
      'New salary for Ravi Menon',
      {},
      WAIT,
    );
    fireEvent.change(cell, { target: { value: '110000' } });
    fireEvent.change(cell, { target: { value: '107000' } });
    fireEvent.blur(cell);
    expect(cell.value).toBe('107,000.00');
    expect(cell.getAttribute('data-overridden')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo edit for Ravi Menon' })).toBeNull();
  });

  it('explains an edit that is not an amount or not a raise', async () => {
    stubBulk();
    render();
    choose('7');
    const cell = await screen.findByLabelText<HTMLInputElement>(
      'New salary for Ravi Menon',
      {},
      WAIT,
    );
    fireEvent.change(cell, { target: { value: '90000' } });
    expect(screen.getByText('Must be higher than the current amount')).toBeDefined();
    expect(cell.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(cell, { target: { value: 'abc' } });
    expect(screen.getByText('Enter an amount, for example 1234.50')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Undo edit for Ravi Menon' })).toBeDefined();
  });

  it('sends the edits to the summary after a pause and shows their change', async () => {
    const { calls } = stubBulk({
      [SUMMARY]: (_, init) => {
        const body = JSON.parse(init.body as string) as { overrides?: unknown[] };
        return Response.json(
          bulkSummary({
            revision: {
              ...bulkSummary().revision!,
              overriddenCount: body.overrides?.length ?? 0,
              overrideChangeBp: body.overrides ? [{ employeeId: 2, changeBp: 1000 }] : [],
            },
          }),
        );
      },
    });
    render();
    choose('7');
    fireEvent.change(await screen.findByLabelText('New salary for Ravi Menon', {}, WAIT), {
      target: { value: '110000' },
    });
    expect(screen.getByText('Updating')).toBeDefined();
    await waitFor(() => {
      expect(calls.filter((c) => c.url.pathname.endsWith('/summary')).at(-1)?.body).toEqual({
        employeeIds: [1, 2],
        percentageBp: 700,
        overrides: [{ employeeId: 2, newAmountMinor: 11_000_000 }],
      });
    }, WAIT);
    expect(await screen.findByText('+10%', {}, WAIT)).toBeDefined();
  });

  it('filters the rows by name and by the quick filters', async () => {
    stubBulk();
    render();
    choose('7');
    await screen.findByText('Ravi Menon', {}, WAIT);
    fireEvent.click(screen.getByRole('radio', { name: 'Outside peer range (1)' }));
    expect(screen.queryByText('Asha Rao')).toBeNull();
    expect(screen.getByText('Above range')).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search people in this revision'), {
      target: { value: 'asha' },
    });
    expect(screen.queryByText('Ravi Menon')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search people in this revision'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('No one matches this search.')).toBeDefined();
  });

  it('keeps edits across pages', async () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      bulkPreviewItem({ employeeId: i + 1, firstName: `Person${String(i + 1).padStart(2, '0')}` }),
    );
    stubBulk({ [PREVIEW]: { items, total: 60 } });
    render();
    choose('7');
    await screen.findByLabelText('New salary for Person01 Rao', {}, WAIT);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    const cell = screen.getByLabelText<HTMLInputElement>('New salary for Person55 Rao');
    fireEvent.change(cell, { target: { value: '120000' } });
    fireEvent.blur(cell);
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.queryByLabelText('New salary for Person55 Rao')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByLabelText<HTMLInputElement>('New salary for Person55 Rao').value).toBe(
      '120,000.00',
    );
  });

  it('stacks the review as editable rows on a narrow screen', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    stubBulk();
    render();
    choose('7');
    expect(await screen.findByLabelText('New salary for Ravi Menon', {}, WAIT)).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the figures for the last percentage chosen when an earlier preview answers late', async () => {
    const three = deferredResponse();
    const { calls } = stubBulk({
      [PREVIEW]: (_, init) => {
        const bp = (JSON.parse(init.body as string) as { percentageBp: number }).percentageBp;
        if (bp === 300) return three.promise;
        return Response.json({
          items: [bulkPreviewItem({ proposedAmountMinor: 11_000_000 })],
          total: 1,
        });
      },
    });
    render();
    choose('3');
    await waitFor(() => {
      expect(calls.some((c) => c.url.pathname.endsWith('/preview'))).toBe(true);
    }, WAIT);
    choose('10');
    const cell = await screen.findByLabelText<HTMLInputElement>(
      'New salary for Asha Rao',
      {},
      WAIT,
    );
    await waitFor(() => {
      expect(cell.value).toBe('110,000.00');
    }, WAIT);
    await three.answer({
      items: [bulkPreviewItem({ proposedAmountMinor: 10_300_000 })],
      total: 1,
    });
    expect(screen.getByLabelText<HTMLInputElement>('New salary for Asha Rao').value).toBe(
      '110,000.00',
    );
  });

  it('says so when the selection has no active employees left', async () => {
    stubBulk({ [PREVIEW]: { items: [], total: 0 } });
    render();
    choose('7');
    expect(
      await screen.findByText('No active employees in this selection.', {}, WAIT),
    ).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Added to annual payroll' })).toBeNull();
  });

  it('offers a retry when the preview fails', async () => {
    let fail = true;
    stubBulk({
      [PREVIEW]: () =>
        fail
          ? apiError(500, 'INTERNAL', 'Server error')
          : Response.json({ items: [bulkPreviewItem()], total: 1 }),
    });
    render();
    choose('7');
    expect(
      await within(screen.getByRole('region', { name: 'Review' })).findByRole('alert', {}, WAIT),
    ).toBeDefined();
    fail = false;
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Review' })).getByRole('button', { name: 'Retry' }),
    );
    expect(await screen.findByLabelText('New salary for Asha Rao', {}, WAIT)).toBeDefined();
  });

  it('says the totals could not be updated and offers a retry when the summary fails', async () => {
    let fail = true;
    stubBulk({
      [SUMMARY]: (_, init) => {
        if (
          (JSON.parse(init.body as string) as { percentageBp?: number }).percentageBp === undefined
        ) {
          return Response.json(bulkSummary({ revision: null }));
        }
        return fail ? apiError(500, 'INTERNAL', 'Server error') : Response.json(bulkSummary());
      },
    });
    render();
    choose('7');
    expect(await screen.findByText('Could not update the totals.', {}, WAIT)).toBeDefined();
    fail = false;
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Review' })).getByRole('button', { name: 'Retry' }),
    );
    expect(await screen.findByText('+$14,000.00')).toBeDefined();
  });

  it('says the people could not be counted and offers a retry', async () => {
    let fail = true;
    stubBulk({
      [SUMMARY]: () =>
        fail
          ? apiError(500, 'INTERNAL', 'Server error')
          : Response.json(bulkSummary({ revision: null })),
    });
    render();
    expect(await screen.findByText('Could not count the people selected.')).toBeDefined();
    fail = false;
    fireEvent.click(
      within(screen.getByRole('complementary', { name: 'Setup' })).getByRole('button', {
        name: 'Retry',
      }),
    );
    expect(await screen.findByText('2 people, active only')).toBeDefined();
  });

  it('reads an edit typed with Indian digit grouping', async () => {
    stubBulk({
      [PREVIEW]: {
        items: [
          bulkPreviewItem({
            countryCode: 'IN',
            currencyCode: 'INR',
            currentAmountMinor: 180_000_000,
            proposedAmountMinor: 192_600_000,
          }),
        ],
        total: 1,
      },
    });
    render();
    choose('7');
    const cell = await screen.findByLabelText<HTMLInputElement>(
      'New salary for Asha Rao',
      {},
      WAIT,
    );
    expect(cell.value).toBe('19,26,000.00');
    fireEvent.change(cell, { target: { value: '19,82,182.62' } });
    fireEvent.blur(cell);
    expect(cell.value).toBe('19,82,182.62');
    expect(cell.getAttribute('data-overridden')).toBe('true');
  });
});
