import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { employeeItem, REFERENCE_ROUTES } from '@/test/fixtures';
import { renderWithQuery, stubApi } from '@/test/render';
import { EmployeesPage } from './employees-page';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

function listResponse(total = 2) {
  return {
    items: [employeeItem(), employeeItem({ id: 2, firstName: 'Ravi', lastName: 'Menon' })],
    total,
    limit: 50,
    offset: 0,
  };
}

function stubList(total?: number) {
  return stubApi({
    ...REFERENCE_ROUTES,
    'GET /api/employees': () => Response.json(listResponse(total)),
  });
}

describe('EmployeesPage', () => {
  beforeEach(() => {
    search = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockClear();
  });

  it('lists active employees by default, asking the server for the first page', async () => {
    const { calls } = stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);

    expect(await screen.findByRole('link', { name: 'Asha Rao' })).toBeDefined();
    const list = calls.find((call) => call.url.pathname === '/api/employees');
    expect(list?.url.searchParams.get('status')).toBe('active');
    expect(list?.url.searchParams.get('offset')).toBe('0');
  });

  it('reads search, filters, sort and page from the URL', async () => {
    search = 'search=ann&country=IN&department=1&status=all&sortBy=salary&sortOrder=desc&page=2';
    const { calls } = stubList(120);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);

    await screen.findByRole('link', { name: 'Asha Rao' });

    const params = calls.find((call) => call.url.pathname === '/api/employees')?.url.searchParams;
    expect(Object.fromEntries(params ?? [])).toMatchObject({
      search: 'ann',
      country: 'IN',
      department: '1',
      status: 'all',
      sortBy: 'salary',
      sortOrder: 'desc',
      offset: '50',
    });
  });

  it('writes a changed filter to the URL and returns to the first page', async () => {
    search = 'page=3';
    stubList(300);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });

    fireEvent.change(await screen.findByLabelText('Status'), { target: { value: 'inactive' } });

    expect(replace).toHaveBeenCalledWith('/employees?status=inactive', { scroll: false });
  });

  it('offers the export of exactly the current filters and of everyone', async () => {
    search = 'search=ann&country=IN';
    stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });

    const current = screen.getByRole('link', { name: 'Export current result' });
    const url = new URL(current.getAttribute('href') ?? '', 'http://localhost');
    expect(url.pathname).toBe('/api/employees/export');
    expect(url.searchParams.get('scope')).toBe('filtered');
    expect(url.searchParams.get('search')).toBe('ann');
    expect(url.searchParams.get('country')).toBe('IN');
  });

  it('shows an empty state with a way to clear the filters', async () => {
    search = 'search=zzz';
    stubApi({
      ...REFERENCE_ROUTES,
      'GET /api/employees': { items: [], total: 0, limit: 50, offset: 0 },
    });
    renderWithQuery(<EmployeesPage today="2026-10-19" />);

    expect(await screen.findByText('No employees match these filters')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(replace).toHaveBeenCalledWith('/employees', { scroll: false });
  });

  it('shows the bulk action bar once rows are selected and offers to select everything that matches', async () => {
    stubList(120);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });
    expect(screen.queryByRole('button', { name: 'Apply % increase' })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));

    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(within(bar).getByText('1 selected')).toBeDefined();
    fireEvent.click(
      within(bar).getByRole('button', { name: 'Select all 120 matching this filter' }),
    );
    expect(within(bar).getByText('All 120 matching selected')).toBeDefined();
  });

  it('previews a bulk revision for the selected employee ids', async () => {
    const { calls } = stubApi({
      ...REFERENCE_ROUTES,
      'GET /api/employees': () => Response.json(listResponse()),
      'POST /api/employees/bulk-salary-changes/preview': { items: [], total: 0 },
    });
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply % increase' }));

    fireEvent.change(screen.getByLabelText('Percentage increase'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.pathname.endsWith('/preview'))).toBe(true);
    });
    expect(calls.find((call) => call.url.pathname.endsWith('/preview'))?.body).toEqual({
      employeeIds: [1],
      percentageBp: 500,
    });
  });
});
