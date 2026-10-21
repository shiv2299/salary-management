import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { employeeFacets, REFERENCE_ROUTES } from '@/test/fixtures';
import { renderWithQuery, stubApi } from '@/test/render';
import { EmployeeFilterPanel } from './employee-filter-panel';
import { DEFAULT_FILTERS, type ListFilters } from './list-filters';

const onChange = vi.fn();

function renderPanel(
  props: { filters?: ListFilters; facets?: ReturnType<typeof employeeFacets> } = {},
) {
  stubApi(REFERENCE_ROUTES);
  return renderWithQuery(
    <EmployeeFilterPanel
      filters={props.filters ?? DEFAULT_FILTERS}
      onChange={onChange}
      facets={props.facets}
    />,
  );
}

describe('EmployeeFilterPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    onChange.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists each status, country, department and level with its count', async () => {
    renderPanel({ facets: employeeFacets({ country: [{ value: 'IN', count: 120 }] }) });
    const country = await screen.findByRole('group', { name: 'Country' });
    const india = await within(country).findByRole('checkbox', { name: 'India' });
    expect(document.getElementById(india.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      '120',
    );
    const germany = within(country).getByRole('checkbox', { name: 'Germany' });
    expect(
      document.getElementById(germany.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('0');
    expect(
      within(screen.getByRole('group', { name: 'Status' })).getAllByRole('checkbox'),
    ).toHaveLength(2);
    expect(await screen.findByRole('checkbox', { name: 'Engineering' })).toBeDefined();
    expect(await screen.findByRole('checkbox', { name: 'L3' })).toBeDefined();
  });

  it('leaves the counts blank until the facets arrive', async () => {
    renderPanel();
    const india = await screen.findByRole('checkbox', { name: 'India' });
    expect(india.getAttribute('aria-describedby')).toBeNull();
  });

  it('adds a second country to the selection instead of replacing it', async () => {
    renderPanel({ filters: { ...DEFAULT_FILTERS, country: ['IN'] } });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Germany' }));
    expect(onChange).toHaveBeenCalledWith({ country: ['IN', 'DE'] });
  });

  it('shows everyone when both statuses are ticked and the default list when the last one is unticked', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inactive' }));
    expect(onChange).toHaveBeenLastCalledWith({ status: 'all' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Active' }));
    expect(onChange).toHaveBeenLastCalledWith({ status: 'active' });
  });

  it('collapses to give the table full width and remembers that in this browser', () => {
    const { unmount } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Hide filters' }));
    expect(localStorage.getItem('employees.filters.collapsed')).toBe('true');
    expect(screen.queryByRole('group', { name: 'Country' })).toBeNull();
    unmount();
    renderPanel();
    expect(screen.getByRole('button', { name: 'Show filters' })).toBeDefined();
  });

  it('brings the panel back when asked to show the filters again', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Hide filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeDefined();
    expect(localStorage.getItem('employees.filters.collapsed')).toBe('false');
  });

  it('still works when the browser refuses access to storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Hide filters' }));
    expect(screen.getByRole('button', { name: 'Show filters' })).toBeDefined();
  });

  it('opens the filters in a bottom sheet on a narrow screen, counting the active ones', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    renderPanel({ filters: { ...DEFAULT_FILTERS, country: ['IN', 'DE'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Filters (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeDefined();
    expect(await within(dialog).findByRole('checkbox', { name: 'India' })).toBeDefined();
  });
});
