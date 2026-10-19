import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZE,
  bulkFilterFrom,
  exportHref,
  filtersFromParams,
  listApiQuery,
  paramsFromFilters,
} from './list-filters';

describe('filtersFromParams', () => {
  it('defaults to active employees, sorted by name, on the first page', () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual({
      status: 'active',
      sortBy: 'name',
      sortOrder: 'asc',
      page: 1,
    });
  });

  it('reads every filter back from the URL', () => {
    const filters = filtersFromParams(
      new URLSearchParams(
        'search=ann&country=IN&department=3&level=4&status=all&sortBy=salary&sortOrder=desc&page=3',
      ),
    );

    expect(filters).toEqual({
      search: 'ann',
      country: 'IN',
      department: 3,
      level: 4,
      status: 'all',
      sortBy: 'salary',
      sortOrder: 'desc',
      page: 3,
    });
  });

  it('ignores values that are not valid instead of failing', () => {
    const filters = filtersFromParams(
      new URLSearchParams('status=bogus&sortBy=nope&page=-2&department=abc'),
    );

    expect(filters).toEqual({ status: 'active', sortBy: 'name', sortOrder: 'asc', page: 1 });
  });
});

describe('paramsFromFilters', () => {
  it('leaves defaults out so the URL stays short', () => {
    const params = paramsFromFilters({
      status: 'active',
      sortBy: 'name',
      sortOrder: 'asc',
      page: 1,
    });

    expect(params.toString()).toBe('');
  });

  it('round-trips a full set of filters', () => {
    const filters = {
      search: 'a b',
      country: 'DE',
      department: 2,
      level: 5,
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
    const query = listApiQuery({ status: 'active', sortBy: 'name', sortOrder: 'asc', page: 3 });

    expect(query.get('limit')).toBe(String(PAGE_SIZE));
    expect(query.get('offset')).toBe(String(PAGE_SIZE * 2));
    expect(query.get('status')).toBe('active');
  });
});

describe('exportHref', () => {
  it('exports exactly the current filters and sort, without paging', () => {
    const href = exportHref('filtered', {
      search: 'ann',
      country: 'IN',
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

  it('exports everything with no filters for the all scope', () => {
    expect(exportHref('all')).toBe('/api/employees/export?scope=all');
  });
});

describe('bulkFilterFrom', () => {
  it('carries only the filters a bulk revision understands', () => {
    expect(
      bulkFilterFrom({
        search: 'x',
        country: 'IN',
        department: 1,
        level: 2,
        status: 'inactive',
        sortBy: 'name',
        sortOrder: 'asc',
        page: 5,
      }),
    ).toEqual({ search: 'x', country: 'IN', department: 1, level: 2 });
  });
});
