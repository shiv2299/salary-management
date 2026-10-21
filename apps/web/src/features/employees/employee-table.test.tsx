import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { employeeItem, REFERENCE_ROUTES } from '@/test/fixtures';
import { renderWithQuery, stubApi } from '@/test/render';
import { ColumnsMenu } from './columns-menu';
import { ALL_COLUMNS_VISIBLE, EmployeeTable } from './employee-table';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a
      href={href}
      onClick={(event) => {
        // jsdom cannot navigate; the real link would be handled by the router.
        event.preventDefault();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

const noop = () => undefined;

const items = [
  employeeItem(),
  employeeItem({
    id: 2,
    firstName: 'Lena',
    lastName: 'Fischer',
    countryCode: 'DE',
    status: 'inactive',
    salary: {
      amountMinor: 7_200_000,
      currencyCode: 'EUR',
      amountBaseMinor: 7_776_000,
      effectiveDate: '2024-01-01',
    },
  }),
];

const onSort = vi.fn();
const onOpen = vi.fn();
const onSelectionChange = vi.fn();

function renderTable(props: Partial<React.ComponentProps<typeof EmployeeTable>> = {}) {
  return renderWithQuery(
    <EmployeeTable
      items={items}
      sortBy="name"
      sortOrder="asc"
      onSort={onSort}
      selectable
      selectMode={false}
      selectedIds={new Set()}
      onSelectionChange={onSelectionChange}
      columnVisibility={ALL_COLUMNS_VISIBLE}
      onOpen={onOpen}
      detailQuery="status=all"
      {...props}
    />,
  );
}

function narrowScreen() {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
  }));
}

describe('EmployeeTable', () => {
  beforeEach(() => {
    stubApi(REFERENCE_ROUTES);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows the avatar, job title, level badge, country name and pay in local currency and USD', async () => {
    renderTable();

    const row = screen.getByRole('link', { name: 'Asha Rao' }).closest('tr')!;
    expect(within(row).getByText('AR')).toBeDefined();
    expect(within(row).getByText('Software Engineer')).toBeDefined();
    expect(within(row).getByText('Engineering')).toBeDefined();
    expect(within(row).getByText('L3')).toBeDefined();
    expect(await within(row).findByText('India')).toBeDefined();
    expect(within(row).getByText('₹50,00,000.00')).toBeDefined();
    expect(within(row).getByText('$59,900.00')).toBeDefined();
  });

  it('leaves out the USD figure for someone paid in USD', () => {
    renderTable({
      items: [
        employeeItem({
          countryCode: 'US',
          salary: {
            amountMinor: 9_000_000,
            currencyCode: 'USD',
            amountBaseMinor: 9_000_000,
            effectiveDate: '2025-01-01',
          },
        }),
      ],
    });

    expect(screen.getAllByText('$90,000.00')).toHaveLength(1);
  });

  it('marks a deactivated employee with an Inactive badge', () => {
    renderTable();

    const inactive = screen.getByRole('link', { name: 'Lena Fischer' }).closest('tr')!;
    const active = screen.getByRole('link', { name: 'Asha Rao' }).closest('tr')!;
    expect(within(inactive).getByText('Inactive')).toBeDefined();
    expect(within(active).queryByText('Inactive')).toBeNull();
  });

  it('carries the list filters on the detail link so the list behind the drawer keeps them', () => {
    renderTable();

    expect(screen.getByRole('link', { name: 'Asha Rao' }).getAttribute('href')).toBe(
      '/employees/1?status=all',
    );
  });

  it('sorts by every column from its header and marks the active one', () => {
    renderTable({ sortBy: 'level', sortOrder: 'desc' });

    for (const [label, key] of [
      ['Name', 'name'],
      ['Job title', 'jobTitle'],
      ['Department', 'department'],
      ['Level', 'level'],
      ['Country', 'country'],
      ['Hired', 'hireDate'],
      ['Salary', 'salary'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Sort by ${label}` }));
      expect(onSort).toHaveBeenLastCalledWith(key);
    }
    expect(screen.getByRole('columnheader', { name: /Level/ }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: /Department/ }).hasAttribute('aria-sort')).toBe(
      false,
    );
  });

  it('draws the active sort arrow in the accent colour', () => {
    renderTable({ sortBy: 'salary', sortOrder: 'asc' });

    const active = screen.getByRole('button', { name: 'Sort by Salary' }).querySelector('svg')!;
    const idle = screen.getByRole('button', { name: 'Sort by Level' }).querySelector('svg')!;
    expect(active.getAttribute('class')).toContain('text-primary');
    expect(idle.getAttribute('class')).not.toContain('text-primary');
  });

  it('opens the drawer from a click anywhere on a row except the checkbox and the name link', () => {
    renderTable();

    const row = screen.getByRole('link', { name: 'Asha Rao' }).closest('tr')!;
    fireEvent.click(within(row).getByText('Engineering'));
    expect(onOpen).toHaveBeenCalledWith(1);
    onOpen.mockClear();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
    fireEvent.click(screen.getByRole('link', { name: 'Asha Rao' }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('selects a row from its checkbox and the whole page from the header checkbox', () => {
    renderTable();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([1]));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([1, 2]));
  });

  it('keeps rows selected on other pages when the header checkbox is used', () => {
    renderTable({ selectedIds: new Set([99]) });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));

    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([99, 1, 2]));
  });

  it('hides the columns switched off', () => {
    renderTable({ columnVisibility: { ...ALL_COLUMNS_VISIBLE, department: false } });

    expect(screen.queryByRole('columnheader', { name: /Department/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: /Salary/ })).toBeDefined();
  });

  it('renders a compact list instead of a table on a narrow screen', () => {
    narrowScreen();

    renderTable();

    expect(screen.queryByRole('table')).toBeNull();
    const link = screen.getByRole('link', { name: /Asha Rao/ });
    expect(link.textContent).toContain('Engineering · L3');
    expect(link.textContent).toContain('₹50,00,000.00');
    expect(link.textContent).toContain('AR');
  });

  it('shows checkboxes on the compact list only while select mode is on', () => {
    narrowScreen();

    const { unmount } = renderTable();
    expect(screen.queryByRole('checkbox')).toBeNull();
    unmount();

    renderTable({ selectMode: true });
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('reports a selection change from the compact list', () => {
    narrowScreen();

    renderTable({ selectMode: true, selectedIds: new Set([2]) });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));

    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([2, 1]));
  });
});

describe('ColumnsMenu', () => {
  it('lists the hideable columns in the Columns menu and reports a change', async () => {
    const onChange = vi.fn();
    render(<ColumnsMenu visibility={ALL_COLUMNS_VISIBLE} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Columns' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Department' }));

    expect(onChange).toHaveBeenCalledWith({ ...ALL_COLUMNS_VISIBLE, department: false });
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(5);
  });
});
