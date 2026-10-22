import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { employeeFacets, employeeItem, REFERENCE_ROUTES } from '@/test/fixtures';
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
const push = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
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
    'GET /api/employees/facets': employeeFacets(),
    'GET /api/employees': () => Response.json(listResponse(total)),
  });
}

describe('EmployeesPage', () => {
  beforeEach(() => {
    search = '';
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockClear();
    push.mockClear();
  });

  it('lists active employees by default, asking the server for the first page', async () => {
    const { calls } = stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);

    expect(await screen.findByRole('link', { name: 'Asha Rao' })).toBeDefined();
    const list = calls.find((call) => call.url.pathname === '/api/employees');
    expect(list?.url.searchParams.get('status')).toBe('active');
    expect(list?.url.searchParams.get('offset')).toBe('0');
  });

  it('reads repeated filters, sort, page and page size from the URL', async () => {
    search = 'country=IN&country=DE&level=3&sortBy=level&sortOrder=desc&page=2&pageSize=100';
    const { calls } = stubList(300);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });
    const params = calls.find((c) => c.url.pathname === '/api/employees')!.url.searchParams;
    expect(params.getAll('country')).toEqual(['IN', 'DE']);
    expect([params.get('sortBy'), params.get('limit'), params.get('offset')]).toEqual([
      'level',
      '100',
      '100',
    ]);
  });

  it('shows the selected filters as chips and removes one', async () => {
    search = 'country=IN&country=DE';
    stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove filter India' }));
    expect(replace).toHaveBeenCalledWith('/employees?country=DE', { scroll: false });
  });

  it('clears every filter and the search at once', async () => {
    search = 'search=ann&country=IN&level=3';
    stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
    expect(replace).toHaveBeenCalledWith('/employees', { scroll: false });
  });

  it('keeps a chosen page size when clearing every filter', async () => {
    search = 'country=IN&pageSize=100';
    stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
    expect(replace).toHaveBeenCalledWith('/employees?pageSize=100', { scroll: false });
  });

  it('says how many employees match out of everyone in the chosen status', async () => {
    search = 'country=IN';
    stubList(2914);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    expect(await screen.findByText('2,914 of 9,577')).toBeDefined();
  });

  it('says how many employees there are when nothing is filtered', async () => {
    stubList(9577);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    expect(await screen.findByText('9,577 employees')).toBeDefined();
  });

  it('opens the drawer with the list query when a row is clicked', async () => {
    search = 'country=IN';
    stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    const row = (await screen.findByRole('link', { name: 'Ravi Menon' })).closest('tr')!;
    fireEvent.click(within(row).getByText('Engineering'));
    expect(push).toHaveBeenCalledWith('/employees/2?country=IN', { scroll: false });
  });

  it('changes the rows per page and returns to the first page', async () => {
    search = 'page=3';
    stubList(300);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    fireEvent.change(await screen.findByLabelText('Rows per page'), { target: { value: '100' } });
    expect(replace).toHaveBeenCalledWith('/employees?pageSize=100', { scroll: false });
  });

  it('says how many employees there are when only the status is changed', async () => {
    search = 'status=all';
    stubList(9577);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    expect(await screen.findByText('9,577 employees')).toBeDefined();
  });

  it('leaves out the columns menu on a narrow screen, where the list has no columns', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByText('Asha Rao');
    expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();
  });

  it('hides a column chosen in the columns menu', async () => {
    stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });
    expect(screen.queryByRole('columnheader', { name: /Salary/ })).not.toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Columns' }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Salary' }));
    expect(screen.queryByRole('columnheader', { name: /Salary/ })).toBeNull();
  });

  it('writes a changed filter to the URL and returns to the first page', async () => {
    search = 'page=3';
    stubList(300);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Inactive' }));

    expect(replace).toHaveBeenCalledWith('/employees?status=all', { scroll: false });
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

  it('keeps the rest of the page selected, and the count right, after unticking one row of all matching', async () => {
    stubList(120);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all 120 matching this filter' }));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));

    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(within(bar).getByText('1 selected')).toBeDefined();
    expect(
      within(bar).getByRole('button', { name: 'Select all 120 matching this filter' }),
    ).toBeDefined();
  });

  it('opens the bulk revision screen for the picked employees', async () => {
    search = 'country=US&sortBy=salary';
    stubList();
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Ravi Menon' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply % increase' }));
    expect(push).toHaveBeenCalledWith('/employees/revisions/new?country=US&sortBy=salary&ids=1,2');
  });

  it('opens the bulk revision screen for everyone matching the list', async () => {
    search = 'country=US';
    stubList(120);
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Asha Rao' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all 120 matching this filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply % increase' }));
    expect(push).toHaveBeenCalledWith('/employees/revisions/new?country=US&select=all');
  });

  it('disables the bulk revision when more than 1,000 people are picked by hand', async () => {
    stubApi({
      ...REFERENCE_ROUTES,
      'GET /api/employees/facets': employeeFacets(),
      'GET /api/employees': () =>
        Response.json({
          items: Array.from({ length: 1001 }, (_, index) =>
            employeeItem({ id: index + 1, firstName: `Person${index + 1}`, lastName: 'Test' }),
          ),
          total: 1001,
          limit: 50,
          offset: 0,
        }),
    });
    renderWithQuery(<EmployeesPage today="2026-10-19" />);
    await screen.findByRole('link', { name: 'Person1 Test' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));

    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(within(bar).getByText('Pick up to 1,000 people, or select all matching.')).toBeDefined();
    expect(within(bar).getByRole('button', { name: 'Apply % increase' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
