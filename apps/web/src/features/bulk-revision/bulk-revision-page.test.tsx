import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkPreviewItem, bulkSummary, REFERENCE_ROUTES } from '@/test/fixtures';
import { deferredResponse } from '@/test/deferred';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { toast } from 'sonner';
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

  it('dims the totals while they wait for an edit to be counted', async () => {
    const edited = deferredResponse();
    stubBulk({
      [SUMMARY]: (_, init) => {
        const body = JSON.parse(init.body as string) as { percentageBp?: number; overrides?: [] };
        if (body.overrides) return edited.promise;
        return Response.json(
          body.percentageBp === undefined ? bulkSummary({ revision: null }) : bulkSummary(),
        );
      },
    });
    render();
    choose('7');
    const tile = await screen.findByRole('group', { name: 'Added to annual payroll' }, WAIT);
    expect(await within(tile).findByText('+$14,000.00', {}, WAIT)).toBeDefined();
    expect(tile.className).not.toContain('opacity-60');
    fireEvent.change(screen.getByLabelText('New salary for Ravi Menon'), {
      target: { value: '110000' },
    });
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Added to annual payroll' }).className).toContain(
        'opacity-60',
      );
    }, WAIT);
    expect(screen.getByRole('group', { name: 'Outside peer range' }).className).not.toContain(
      'opacity-60',
    );
    await edited.answer(bulkSummary());
    await waitFor(() => {
      expect(
        screen.getByRole('group', { name: 'Added to annual payroll' }).className,
      ).not.toContain('opacity-60');
    }, WAIT);
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
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Review & confirm 0 changes →' })
        .disabled,
    ).toBe(true);
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

  it('keeps the people counted when the totals later fail', async () => {
    stubBulk({
      [SUMMARY]: (_, init) =>
        (JSON.parse(init.body as string) as { percentageBp?: number }).percentageBp === undefined
          ? Response.json(bulkSummary({ revision: null }))
          : apiError(500, 'INTERNAL', 'Server error'),
    });
    render();
    expect(await screen.findByText('2 people, active only')).toBeDefined();
    choose('7');
    expect(await screen.findByText('Could not update the totals.', {}, WAIT)).toBeDefined();
    expect(screen.getByText('2 people, active only')).toBeDefined();
    expect(
      within(screen.getByRole('list', { name: 'By department' })).getByText('Engineering'),
    ).toBeDefined();
    expect(screen.queryByText('Could not count the people selected.')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
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

describe('BulkRevisionPage confirmation', () => {
  const CONFIRM = 'POST /api/employees/bulk-salary-changes';
  const openDialog = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Review & confirm 2 changes →' }));
  };

  beforeEach(() => {
    search = 'ids=1,2';
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('summarises the revision in the confirmation dialog', async () => {
    stubBulk();
    render();
    choose('7');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review & confirm 2 changes →' }, WAIT),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Confirm salary revision' });
    for (const text of ['7%', '2', '19 Oct 2026', '+$14,000.00', 'Selected employees']) {
      expect(within(dialog).getByText(text)).toBeDefined();
    }
    // the open modal hides the rest of the page from the accessibility tree
    expect(
      within(screen.getByRole('list', { name: 'Progress', hidden: true }))
        .getByText('Confirm')
        .closest('li')
        ?.getAttribute('aria-current'),
    ).toBe('step');
  });

  it('groups the digits of a large count in the button and the confirmation', async () => {
    const items = Array.from({ length: 1010 }, (_, i) => bulkPreviewItem({ employeeId: i + 1 }));
    stubBulk({ [PREVIEW]: { items, total: 1010 } });
    render();
    choose('7');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review & confirm 1,010 changes →' }, WAIT),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Confirm salary revision' });
    expect(within(dialog).getByText('1,010')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Apply 1,010 raises' })).toBeDefined();
  });

  it('confirms exactly the previewed list with its edits and shows the success state', async () => {
    const { calls } = stubBulk({
      [CONFIRM]: () =>
        Response.json(
          { batchId: 4, employeeCount: 2, effectiveDate: '2026-10-19' },
          { status: 201 },
        ),
    });
    search = 'country=US&ids=1,2';
    render();
    choose('7');
    fireEvent.change(await screen.findByLabelText('New salary for Ravi Menon', {}, WAIT), {
      target: { value: '110000' },
    });
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Review & confirm 2 changes →' })
          .disabled,
      ).toBe(false);
    }, WAIT);
    openDialog();
    const apply = await screen.findByRole('button', { name: 'Apply 2 raises' });
    await waitFor(() => {
      expect((apply as HTMLButtonElement).disabled).toBe(false);
    }, WAIT);
    fireEvent.click(apply);
    expect(await screen.findByRole('heading', { name: 'Revision applied' })).toBeDefined();
    expect(
      calls.find(
        (c) => c.method === 'POST' && c.url.pathname === '/api/employees/bulk-salary-changes',
      )?.body,
    ).toEqual({
      percentageBp: 700,
      effectiveDate: '2026-10-19',
      note: 'Selected employees',
      items: [
        { employeeId: 1, expectedCurrentAmountMinor: 10_000_000, newAmountMinor: 10_700_000 },
        { employeeId: 2, expectedCurrentAmountMinor: 10_000_000, newAmountMinor: 11_000_000 },
      ],
    });
    expect(screen.getByText('2 raises recorded, effective 19 Oct 2026.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'View employees' }).getAttribute('href')).toBe(
      '/employees?country=US',
    );
    expect(screen.getByRole('link', { name: 'View insights' }).getAttribute('href')).toBe(
      '/insights',
    );
  });

  it('keeps the confirm button disabled while an edit is not a valid raise', async () => {
    stubBulk();
    render();
    choose('7');
    fireEvent.change(await screen.findByLabelText('New salary for Ravi Menon', {}, WAIT), {
      target: { value: '90000' },
    });
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Review & confirm 2 changes →' })
        .disabled,
    ).toBe(true);
    expect(screen.getByText('Fix the highlighted amounts before confirming.')).toBeDefined();
  });

  it('keeps the confirm button disabled while a newly typed percentage waits for its pause', async () => {
    stubBulk();
    render();
    choose('7');
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Review & confirm 2 changes →' })
          .disabled,
      ).toBe(false);
    }, WAIT);
    choose('10');
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Review & confirm 2 changes →' })
        .disabled,
    ).toBe(true);
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Review & confirm 2 changes →' })
          .disabled,
      ).toBe(false);
    }, WAIT);
  });

  it('applies a newly chosen percentage only with the amounts of its own preview', async () => {
    const twoAt = (proposedAmountMinor: number) => ({
      items: [
        bulkPreviewItem({ proposedAmountMinor }),
        bulkPreviewItem({
          employeeId: 2,
          firstName: 'Ravi',
          lastName: 'Menon',
          proposedAmountMinor,
        }),
      ],
      total: 2,
    });
    const ten = deferredResponse();
    const { calls } = stubBulk({
      [PREVIEW]: (_, init) =>
        (JSON.parse(init.body as string) as { percentageBp: number }).percentageBp === 1000
          ? ten.promise
          : Response.json(twoAt(10_700_000)),
      [SUMMARY]: (_, init) => {
        const bp = (JSON.parse(init.body as string) as { percentageBp?: number }).percentageBp;
        if (bp === undefined) return Response.json(bulkSummary({ revision: null }));
        const added = bp === 1000 ? 2_000_000 : 1_400_000;
        return Response.json(
          bulkSummary({
            revision: {
              ...bulkSummary().revision!,
              percentageBp: bp,
              addedByCurrency: [{ currencyCode: 'USD', addedMinor: added }],
              addedBaseMinor: added,
            },
          }),
        );
      },
      [CONFIRM]: () =>
        Response.json(
          { batchId: 4, employeeCount: 2, effectiveDate: '2026-10-19' },
          { status: 201 },
        ),
    });
    render();
    choose('7');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review & confirm 2 changes →' }, WAIT),
    );
    const apply = await screen.findByRole<HTMLButtonElement>('button', { name: 'Apply 2 raises' });
    await waitFor(() => {
      expect(apply.disabled).toBe(false);
    }, WAIT);

    choose('10');
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('+$20,000.00', {}, WAIT)).toBeDefined();
    expect(apply.disabled).toBe(true);

    await ten.answer(twoAt(11_000_000));
    await waitFor(() => {
      expect(apply.disabled).toBe(false);
    }, WAIT);
    fireEvent.click(apply);
    expect(await screen.findByRole('heading', { name: 'Revision applied' })).toBeDefined();
    expect(
      calls.find(
        (c) => c.method === 'POST' && c.url.pathname === '/api/employees/bulk-salary-changes',
      )?.body,
    ).toMatchObject({
      percentageBp: 1000,
      items: [
        { employeeId: 1, newAmountMinor: 11_000_000 },
        { employeeId: 2, newAmountMinor: 11_000_000 },
      ],
    });
  });

  it('reloads a stale preview, says so, and keeps edits for people whose pay did not change', async () => {
    let previews = 0;
    const { calls } = stubBulk({
      [PREVIEW]: () => {
        previews += 1;
        return Response.json({
          items: [
            bulkPreviewItem(),
            bulkPreviewItem({
              employeeId: 2,
              firstName: 'Ravi',
              lastName: 'Menon',
              ...(previews === 1
                ? {}
                : { currentAmountMinor: 10_500_000, proposedAmountMinor: 11_235_000 }),
            }),
          ],
          total: 2,
        });
      },
      [CONFIRM]: apiError(409, 'CONFLICT', 'Salaries changed since the preview. Preview again.'),
    });
    const summaries = () => calls.filter((c) => c.url.pathname.endsWith('/summary')).length;
    render();
    choose('7');
    fireEvent.change(await screen.findByLabelText('New salary for Asha Rao', {}, WAIT), {
      target: { value: '120000' },
    });
    fireEvent.change(screen.getByLabelText('New salary for Ravi Menon'), {
      target: { value: '121000' },
    });
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Review & confirm 2 changes →' })
          .disabled,
      ).toBe(false);
    }, WAIT);
    openDialog();
    const apply = await screen.findByRole('button', { name: 'Apply 2 raises' });
    await waitFor(() => {
      expect((apply as HTMLButtonElement).disabled).toBe(false);
    }, WAIT);
    const summariesBefore = summaries();
    fireEvent.click(apply);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Salaries changed since the preview. The preview has been reloaded.',
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('New salary for Ravi Menon').value).toBe(
        '112,350.00',
      );
    }, WAIT);
    expect(previews).toBe(2);
    expect(screen.getByLabelText<HTMLInputElement>('New salary for Asha Rao').value).toBe('120000');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => {
      expect(summaries()).toBeGreaterThan(summariesBefore);
    }, WAIT);
  });

  it('asks for the totals again after a stale preview even when no edit changes', async () => {
    let previews = 0;
    let revisionSummaries = 0;
    const { calls } = stubBulk({
      [PREVIEW]: () => {
        previews += 1;
        return Response.json({
          items: [
            bulkPreviewItem(),
            bulkPreviewItem({
              employeeId: 2,
              firstName: 'Ravi',
              lastName: 'Menon',
              ...(previews === 1
                ? {}
                : { currentAmountMinor: 10_500_000, proposedAmountMinor: 11_235_000 }),
            }),
          ],
          total: 2,
        });
      },
      [SUMMARY]: (_, init) => {
        if (
          (JSON.parse(init.body as string) as { percentageBp?: number }).percentageBp === undefined
        ) {
          return Response.json(bulkSummary({ revision: null }));
        }
        revisionSummaries += 1;
        const added = revisionSummaries === 1 ? 1_400_000 : 1_435_000;
        return Response.json(
          bulkSummary({
            revision: {
              ...bulkSummary().revision!,
              addedByCurrency: [{ currencyCode: 'USD', addedMinor: added }],
              addedBaseMinor: added,
            },
          }),
        );
      },
      [CONFIRM]: apiError(409, 'CONFLICT', 'Salaries changed since the preview. Preview again.'),
    });
    render();
    choose('7');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review & confirm 2 changes →' }, WAIT),
    );
    const apply = await screen.findByRole<HTMLButtonElement>('button', { name: 'Apply 2 raises' });
    await waitFor(() => {
      expect(apply.disabled).toBe(false);
    }, WAIT);
    fireEvent.click(apply);

    const tile = await screen.findByRole('group', { name: 'Added to annual payroll' });
    expect(await within(tile).findByText('+$14,350.00', {}, WAIT)).toBeDefined();
    expect(
      calls.filter(
        (c) =>
          c.url.pathname.endsWith('/summary') &&
          JSON.stringify(c.body) === JSON.stringify({ employeeIds: [1, 2], percentageBp: 700 }),
      ),
    ).toHaveLength(2);
  });

  it('says the preview could not be reloaded after a conflict and keeps the edits', async () => {
    let previews = 0;
    stubBulk({
      [PREVIEW]: () => {
        previews += 1;
        return previews === 2
          ? apiError(500, 'INTERNAL', 'Server error')
          : Response.json({
              items: [
                bulkPreviewItem(),
                bulkPreviewItem({ employeeId: 2, firstName: 'Ravi', lastName: 'Menon' }),
              ],
              total: 2,
            });
      },
      [CONFIRM]: apiError(409, 'CONFLICT', 'Salaries changed since the preview. Preview again.'),
    });
    render();
    choose('7');
    fireEvent.change(await screen.findByLabelText('New salary for Asha Rao', {}, WAIT), {
      target: { value: '120000' },
    });
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Review & confirm 2 changes →' })
          .disabled,
      ).toBe(false);
    }, WAIT);
    openDialog();
    const apply = await screen.findByRole<HTMLButtonElement>('button', { name: 'Apply 2 raises' });
    await waitFor(() => {
      expect(apply.disabled).toBe(false);
    }, WAIT);
    fireEvent.click(apply);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Salaries changed since the preview, and it could not be reloaded. Try again.',
      );
    });
    expect(toast.error).not.toHaveBeenCalledWith(
      'Salaries changed since the preview. The preview has been reloaded.',
    );
    const review = screen.getByRole('region', { name: 'Review' });
    expect(within(review).getByRole('alert')).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: /^Review & confirm/ }).disabled,
    ).toBe(true);
    fireEvent.click(within(review).getByRole('button', { name: 'Retry' }));
    expect(
      (await screen.findByLabelText<HTMLInputElement>('New salary for Asha Rao', {}, WAIT)).value,
    ).toBe('120000');
  });

  it('says in the dialog why Apply is disabled when the totals fail, and retries them', async () => {
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
    openDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Confirm salary revision' });
    const apply = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Apply 2 raises' });
    expect(apply.disabled).toBe(true);
    expect(within(dialog).getByRole('alert').textContent).toContain('Could not update the totals.');
    fail = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(await within(dialog).findByText('+$14,000.00', {}, WAIT)).toBeDefined();
    await waitFor(() => {
      expect(apply.disabled).toBe(false);
    }, WAIT);
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('shows the broken rule inside the dialog without reloading the preview', async () => {
    let previews = 0;
    stubBulk({
      [PREVIEW]: () => {
        previews += 1;
        return Response.json({
          items: [bulkPreviewItem(), bulkPreviewItem({ employeeId: 2 })],
          total: 2,
        });
      },
      [CONFIRM]: apiError(
        422,
        'INVALID_BULK_REVISION',
        'employee 1: effective date is before the hire date',
      ),
    });
    render();
    choose('7');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review & confirm 2 changes →' }, WAIT),
    );
    const apply = await screen.findByRole('button', { name: 'Apply 2 raises' });
    await waitFor(() => {
      expect((apply as HTMLButtonElement).disabled).toBe(false);
    }, WAIT);
    fireEvent.click(apply);
    const dialog = await screen.findByRole('dialog');
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'employee 1: effective date is before the hire date',
    );
    expect(previews).toBe(1);
  });

  it('cancels back to the list with its filters', () => {
    search = 'country=US&ids=1,2';
    stubBulk();
    render();
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe(
      '/employees?country=US',
    );
  });
});
