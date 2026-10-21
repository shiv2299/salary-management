import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  bulkFilterFrom,
  exportHref,
  filtersFromParams,
  listApiQuery,
  paramsFromFilters,
} from './list-filters';

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
      page: 3,
    });
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

  it('round-trips a full set of filters', () => {
    const filters = {
      search: 'a b',
      country: ['DE', 'IN'],
      department: [2, 7],
      level: [5],
      status: 'inactive' as const,
      sortBy: 'hireDate' as const,
      sortOrder: 'desc' as const,
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
