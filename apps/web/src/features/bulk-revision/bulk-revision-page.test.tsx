import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkPreviewItem, bulkSummary, REFERENCE_ROUTES } from '@/test/fixtures';
import { renderWithQuery, stubApi } from '@/test/render';
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
