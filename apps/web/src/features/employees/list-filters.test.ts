import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  activeFilterCount,
  bulkFilterFrom,
  exportHref,
  facetsApiQuery,
  filterChips,
  filtersFromParams,
  hasActiveFilters,
  listApiQuery,
  paramsFromFilters,
  statusChecks,
  statusFromChecks,
} from './list-filters';
import { REFERENCE_ROUTES } from '@/test/fixtures';

const REFERENCE = {
  countries: REFERENCE_ROUTES['GET /api/reference/countries'],
  departments: REFERENCE_ROUTES['GET /api/reference/departments'],
  levels: REFERENCE_ROUTES['GET /api/reference/levels'],
};

describe('filtersFromParams', () => {
  it('defaults to active employees, sorted by name, on the first page', () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
  });

  it('reads every filter back from the URL', () => {
    const filters = filtersFromParams(
      new URLSearchParams(
        'search=ann&country=IN&department=3&level=4&status=all&sortBy=salary&sortOrder=desc&page=3',
      ),
    );

    expect(filters).toEqual({
      search: 'ann',
      country: ['IN'],
      department: [3],
      level: [4],
      status: 'all',
      sortBy: 'salary',
      sortOrder: 'desc',
      pageSize: 50,
      page: 3,
    });
  });

  it('reads every sort key and a supported page size from the URL', () => {
    expect(
      filtersFromParams(new URLSearchParams('sortBy=level&sortOrder=desc&pageSize=100')),
    ).toMatchObject({ sortBy: 'level', sortOrder: 'desc', pageSize: 100 });
  });

  it('falls back to defaults for values a stale or edited URL may carry and keeps the good ones', () => {
    expect(
      filtersFromParams(
        new URLSearchParams('pageSize=37&sortBy=bogus&page=-2&level=0&level=3&country=IN'),
      ),
    ).toMatchObject({ pageSize: 50, sortBy: 'name', page: 1, level: [3], country: ['IN'] });
  });

  it('reads repeated and comma-separated values and drops the invalid ones', () => {
    const filters = filtersFromParams(
      new URLSearchParams('country=IN&country=DE,US&level=3&level=x&department=0'),
    );

    expect(filters).toMatchObject({ country: ['IN', 'DE', 'US'], level: [3], department: [] });
  });

  it('ignores values that are not valid instead of failing', () => {
    const filters = filtersFromParams(
      new URLSearchParams('status=bogus&sortBy=nope&page=-2&department=abc'),
    );

    expect(filters).toEqual(DEFAULT_FILTERS);
  });
});

describe('paramsFromFilters', () => {
  it('leaves defaults out so the URL stays short', () => {
    expect(paramsFromFilters(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('writes several values of one filter as repeated params', () => {
    expect(paramsFromFilters({ ...DEFAULT_FILTERS, country: ['IN', 'DE'] }).toString()).toBe(
      'country=IN&country=DE',
    );
  });

  it('writes the page size only when it is not the default', () => {
    expect(paramsFromFilters({ ...DEFAULT_FILTERS, pageSize: 100 }).toString()).toBe(
      'pageSize=100',
    );
    expect(paramsFromFilters({ ...DEFAULT_FILTERS, pageSize: 50 }).toString()).toBe('');
  });

  it('round-trips a full set of filters', () => {
    const filters = {
      search: 'a b',
      country: ['DE', 'IN'],
      department: [2, 7],
      level: [5],
      status: 'inactive' as const,
      sortBy: 'hireDate' as const,
      sortOrder: 'desc' as const,
      pageSize: 25 as const,
      page: 2,
    };

    expect(filtersFromParams(paramsFromFilters(filters))).toEqual(filters);
  });
});

describe('listApiQuery', () => {
  it('asks the server for the page that matches the URL page number', () => {
    const query = listApiQuery({ ...DEFAULT_FILTERS, page: 3 });

    expect(query.get('limit')).toBe(String(PAGE_SIZE));
    expect(query.get('offset')).toBe(String(PAGE_SIZE * 2));
    expect(query.get('status')).toBe('active');
  });

  it('asks the server for the page that matches the page number and page size', () => {
    const q = listApiQuery({ ...DEFAULT_FILTERS, page: 3, pageSize: 25 });
    expect([q.get('limit'), q.get('offset')]).toEqual(['25', '50']);
  });
});

describe('status checks', () => {
  it('treats both statuses ticked as all and none ticked as the default active list', () => {
    expect(statusFromChecks(['active', 'inactive'])).toBe('all');
    expect(statusFromChecks([])).toBe('active');
    expect(statusChecks('all')).toEqual(['active', 'inactive']);
  });

  it('maps a single status to a single tick and back', () => {
    expect(statusChecks('inactive')).toEqual(['inactive']);
    expect(statusFromChecks(['inactive'])).toBe('inactive');
    expect(statusFromChecks(['active'])).toBe('active');
  });
});

describe('filterChips', () => {
  it('describes each selected filter as a removable chip', () => {
    const chips = filterChips(
      { ...DEFAULT_FILTERS, country: ['IN', 'DE'], level: [3], status: 'inactive' },
      REFERENCE,
    );
    expect(chips.map((c) => c.label)).toEqual(['India', 'Germany', 'L3', 'Inactive']);
    expect(chips[0]!.remove).toEqual({ country: ['DE'] });
    expect(chips[3]!.remove).toEqual({ status: 'active' });
  });

  it('orders chips by countries, departments, levels then status and labels all-statuses', () => {
    const chips = filterChips(
      { ...DEFAULT_FILTERS, level: [2], department: [2, 1], country: ['US'], status: 'all' },
      REFERENCE,
    );
    expect(chips.map((c) => c.label)).toEqual([
      'United States',
      'Sales',
      'Engineering',
      'L2',
      'Active and inactive',
    ]);
    expect(chips[1]!.remove).toEqual({ department: [1] });
  });

  it('falls back to the raw value when the reference data has no match', () => {
    const chips = filterChips({ ...DEFAULT_FILTERS, country: ['ZZ'], level: [99] }, REFERENCE);
    expect(chips.map((c) => c.label)).toEqual(['ZZ', '99']);
  });

  it('has no chips for the default filters', () => {
    expect(filterChips(DEFAULT_FILTERS, REFERENCE)).toEqual([]);
  });
});

describe('activeFilterCount and hasActiveFilters', () => {
  it('counts every selected value plus one when the status is not the default', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ ...DEFAULT_FILTERS, country: ['IN', 'DE'], level: [3], status: 'all' }),
    ).toBe(4);
  });

  it('reports active filters for a chip or a search and none for the defaults', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: 'ann' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, department: [1] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, status: 'inactive' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sortBy: 'salary', page: 3 })).toBe(false);
  });
});

describe('facetsApiQuery', () => {
  it('builds the facets query from the search, filters and status only', () => {
    expect(
      facetsApiQuery({
        ...DEFAULT_FILTERS,
        search: 'ann',
        level: [3],
        sortBy: 'salary',
        page: 4,
      }).toString(),
    ).toBe('search=ann&level=3&status=active');
  });
});

describe('exportHref', () => {
  it('exports exactly the current filters and sort, without paging', () => {
    const href = exportHref('filtered', {
      ...DEFAULT_FILTERS,
      search: 'ann',
      country: ['IN'],
      status: 'all',
      sortBy: 'salary',
      sortOrder: 'desc',
      page: 4,
    });
    const url = new URL(href, 'http://localhost');

    expect(url.pathname).toBe('/api/employees/export');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      scope: 'filtered',
      search: 'ann',
      country: 'IN',
      status: 'all',
      sortBy: 'salary',
      sortOrder: 'desc',
    });
  });

  it('puts each value of a multi-value filter as its own repeated param', () => {
    const href = exportHref('filtered', {
      ...DEFAULT_FILTERS,
      country: ['IN', 'DE'],
      level: [1, 2],
    });
    const url = new URL(href, 'http://localhost');

    expect(url.searchParams.getAll('country')).toEqual(['IN', 'DE']);
    expect(url.searchParams.getAll('level')).toEqual(['1', '2']);
  });

  it('exports everything with no filters for the all scope', () => {
    expect(exportHref('all')).toBe('/api/employees/export?scope=all');
  });
});

describe('bulkFilterFrom', () => {
  it('carries only the filters a bulk revision understands, as lists', () => {
    expect(
      bulkFilterFrom({
        ...DEFAULT_FILTERS,
        search: 'ann',
        country: ['IN'],
        level: [],
        status: 'all',
      }),
    ).toEqual({ search: 'ann', country: ['IN'] });
  });

  it('ignores the status, sort and page of the list', () => {
    expect(
      bulkFilterFrom({
        ...DEFAULT_FILTERS,
        department: [1, 3],
        level: [2],
        status: 'inactive',
        page: 5,
      }),
    ).toEqual({ department: [1, 3], level: [2] });
  });
});
