import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { employeeItem } from '@/test/fixtures';
import { EmployeeTable } from './employee-table';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
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

function renderTable(props: Partial<React.ComponentProps<typeof EmployeeTable>> = {}) {
  return render(
    <EmployeeTable
      items={items}
      sortBy="name"
      sortOrder="asc"
      onSort={noop}
      selectable
      selectMode={false}
      selectedIds={new Set()}
      onToggle={noop}
      onTogglePage={noop}
      detailQuery="status=all"
      {...props}
    />,
  );
}

describe('EmployeeTable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a row per employee with local pay, USD pay and level', () => {
    renderTable();

    const row = screen.getByRole('link', { name: 'Asha Rao' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('Engineering')).toBeDefined();
    expect(within(row).getByText('L3')).toBeDefined();
    expect(within(row).getByText('₹50,00,000.00')).toBeDefined();
    expect(within(row).getByText('$59,900.00')).toBeDefined();
  });

  it('marks a deactivated employee with an Inactive badge', () => {
    renderTable();

    const inactive = screen
      .getByRole('link', { name: 'Lena Fischer' })
      .closest('tr') as HTMLElement;
    const active = screen.getByRole('link', { name: 'Asha Rao' }).closest('tr') as HTMLElement;
    expect(within(inactive).getByText('Inactive')).toBeDefined();
    expect(within(active).queryByText('Inactive')).toBeNull();
  });

  it('carries the list filters on the detail link so the list behind the drawer keeps them', () => {
    renderTable();

    expect(screen.getByRole('link', { name: 'Asha Rao' }).getAttribute('href')).toBe(
      '/employees/1?status=all',
    );
  });

  it('sorts by salary when the salary header is clicked and reports the current sort', () => {
    const onSort = vi.fn();
    renderTable({ onSort, sortBy: 'name' });

    fireEvent.click(screen.getByRole('button', { name: /Salary \(USD\)/ }));

    expect(onSort).toHaveBeenCalledWith('salary');
    expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
  });

  it('selects a row from its checkbox', () => {
    const onToggle = vi.fn();
    renderTable({ onToggle });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));

    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('renders a compact list instead of a table on a narrow screen', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: noop,
      removeEventListener: noop,
    }));

    renderTable();

    expect(screen.queryByRole('table')).toBeNull();
    const link = screen.getByRole('link', { name: /Asha Rao/ });
    expect(link.textContent).toContain('Engineering · L3');
    expect(link.textContent).toContain('₹50,00,000.00');
  });

  it('shows checkboxes on the compact list only while select mode is on', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: noop,
      removeEventListener: noop,
    }));
    const { rerender } = renderTable();
    expect(screen.queryByRole('checkbox')).toBeNull();

    rerender(
      <EmployeeTable
        items={items}
        sortBy="name"
        sortOrder="asc"
        onSort={noop}
        selectable
        selectMode
        selectedIds={new Set()}
        onToggle={noop}
        onTogglePage={noop}
        detailQuery=""
      />,
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });
});
