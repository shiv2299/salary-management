import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery, stubApi } from '@/test/render';
import { ChangesPage } from './changes-page';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

function changesResponse(url: URL, total: number) {
  const year = url.searchParams.get('year');
  return {
    range: url.searchParams.get('range') ?? '3y',
    year: year === null ? null : Number(year),
    windowStart: '2023-01-15',
    windowEnd: '2026-01-15',
    availableYears: [2026, 2025, 2024, 2019],
    total,
    limit: Number(url.searchParams.get('limit')),
    offset: Number(url.searchParams.get('offset')),
    items:
      total === 0
        ? []
        : [
            {
              kind: 'batch',
              batchId: 7,
              effectiveDate: '2026-01-01',
              headcount: 1233,
              percentageBp: 357,
              note: 'Annual increment 2026',
            },
            {
              kind: 'individual',
              historyId: 11,
              effectiveDate: '2025-03-02',
              reason: 'raise',
              employee: {
                id: 5,
                firstName: 'Asha',
                lastName: 'Rao',
                countryCode: 'IN',
                status: 'active',
              },
              from: { amountMinor: 100_000_000, currencyCode: 'INR' },
              to: { amountMinor: 120_000_000, currencyCode: 'INR' },
            },
          ],
  };
}

function stubChanges(total = 1234) {
  return stubApi({
    'GET /api/insights/recent-changes': (url) => Response.json(changesResponse(url, total)),
  });
}

function requests(calls: ReturnType<typeof stubChanges>['calls']) {
  return calls
    .filter((call) => call.url.pathname === '/api/insights/recent-changes')
    .map((call) => call.url.search);
}

describe('ChangesPage', () => {
  beforeEach(() => {
    search = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockClear();
  });

  it('reads range, reason, year and page from the URL and asks for them', async () => {
    search = 'range=5y&reason=promotion&page=2';
    const { calls } = stubChanges();
    renderWithQuery(<ChangesPage />);

    expect(await screen.findByRole('link', { name: 'Asha Rao' })).toBeDefined();
    expect(requests(calls)).toEqual(['?range=5y&reason=promotion&limit=25&offset=25']);
    expect(screen.getByRole('radio', { name: '5Y' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText<HTMLSelectElement>('Reason').value).toBe('promotion');

    search = 'year=2024&reason=hire';
    const second = stubChanges();
    renderWithQuery(<ChangesPage />);
    await vi.waitFor(() => {
      expect(requests(second.calls)).toEqual(['?range=3y&year=2024&reason=hire&limit=25&offset=0']);
    });
  });

  it('defaults to the last 3 years', async () => {
    const { calls } = stubChanges();
    renderWithQuery(<ChangesPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Salary changes' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to insights' }).getAttribute('href')).toBe(
      '/insights',
    );
    await screen.findByRole('link', { name: 'Asha Rao' });
    expect(requests(calls)).toEqual(['?range=3y&limit=25&offset=0']);
    expect(screen.getByRole('radio', { name: '3Y' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText<HTMLSelectElement>('Reason').value).toBe('');
    expect(screen.getByLabelText<HTMLSelectElement>('Year').value).toBe('');
  });

  it('replaces the range with the chosen year', async () => {
    search = 'range=5y&page=3';
    stubChanges();
    const { unmount } = renderWithQuery(<ChangesPage />);
    await screen.findByRole('option', { name: '2024' });

    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2024' } });

    expect(replace).toHaveBeenCalledWith('/insights/changes?range=5y&year=2024', {
      scroll: false,
    });

    unmount();
    search = 'range=5y&year=2024';
    stubChanges();
    renderWithQuery(<ChangesPage />);

    expect(screen.getByText('In 2024')).toBeDefined();
    expect(screen.queryByRole('radiogroup', { name: 'Range' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear year' }));

    expect(replace).toHaveBeenLastCalledWith('/insights/changes?range=5y', { scroll: false });
  });

  it('drops the page when the range or reason changes', async () => {
    search = 'page=3';
    stubChanges();
    renderWithQuery(<ChangesPage />);
    await screen.findByRole('link', { name: 'Asha Rao' });

    fireEvent.click(screen.getByRole('radio', { name: '10Y' }));
    expect(replace).toHaveBeenLastCalledWith('/insights/changes?range=10y', { scroll: false });

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'relocation' } });
    expect(replace).toHaveBeenLastCalledWith('/insights/changes?reason=relocation', {
      scroll: false,
    });
  });

  it('pages through the changes with the shared pagination', async () => {
    search = 'page=2';
    stubChanges();
    renderWithQuery(<ChangesPage />);

    expect(await screen.findByText('26–50 of 1,234')).toBeDefined();
    expect(screen.queryByLabelText('Rows per page')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(replace).toHaveBeenLastCalledWith('/insights/changes?page=3', { scroll: false });

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(replace).toHaveBeenLastCalledWith('/insights/changes', { scroll: false });
  });

  it('offers the years that have changes', async () => {
    stubChanges();
    renderWithQuery(<ChangesPage />);

    const year = screen.getByLabelText('Year');
    await within(year).findByRole('option', { name: '2019' });
    expect(
      within(year)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Any year', '2026', '2025', '2024', '2019']);
    expect(
      within(screen.getByLabelText('Reason'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All reasons', 'Hire', 'Raise', 'Promotion', 'Relocation', 'Correction']);
  });

  it('shows the empty state with a way back', async () => {
    search = 'range=all&reason=correction&year=2019';
    stubChanges(0);
    renderWithQuery(<ChangesPage />);

    expect(await screen.findByText('No salary changes match these filters.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(replace).toHaveBeenCalledWith('/insights/changes', { scroll: false });
  });

  it('shows a bulk revision as one row and marks a raise in the positive colour', async () => {
    stubChanges();
    renderWithQuery(<ChangesPage />);

    const bulk = await screen.findByText('1,233 people · +3.57% · Annual increment 2026');
    expect(within(bulk.closest('li') as HTMLElement).getByText('Bulk revision')).toBeDefined();
    const row = screen.getByRole('link', { name: 'Asha Rao' }).closest('li') as HTMLElement;
    expect(within(row).getByText('Raise')).toBeDefined();
    expect(within(row).queryByText('Inactive')).toBeNull();
    expect(within(row).getByText('₹12,00,000').className).toContain('text-positive');
  });
});
