import { DEFAULT_PAGE_SIZE, employeeListQuerySchema, type BulkPreviewBody } from '@acme/shared';

export const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export interface ListFilters {
  search?: string;
  /** Empty means no filter; several values match any of them. */
  country: string[];
  department: number[];
  level: number[];
  status: 'active' | 'inactive' | 'all';
  sortBy: 'name' | 'salary' | 'hireDate';
  sortOrder: 'asc' | 'desc';
  /** 1-based page number as it appears in the URL. */
  page: number;
}

export const DEFAULT_FILTERS: ListFilters = {
  country: [],
  department: [],
  level: [],
  status: 'active',
  sortBy: 'name',
  sortOrder: 'asc',
  page: 1,
};

type MultiValueKey = 'country' | 'department' | 'level';
const MULTI_VALUE_KEYS: MultiValueKey[] = ['country', 'department', 'level'];

function pick<K extends 'status' | 'sortBy' | 'sortOrder' | 'search'>(
  params: URLSearchParams,
  key: K,
  schema: (typeof employeeListQuerySchema)['shape'][K &
    keyof (typeof employeeListQuerySchema)['shape']],
) {
  const raw = params.get(key);
  if (raw === null) return undefined;
  const result = schema.safeParse(raw);
  return result.success ? (result.data as unknown) : undefined;
}

/** Every repeated or comma-separated value of a param that the shared schema accepts, once each. */
function pickAll<K extends MultiValueKey>(params: URLSearchParams, key: K): ListFilters[K] {
  const schema = employeeListQuerySchema.shape[key];
  const values = new Set<unknown>();
  for (const raw of params.getAll(key)) {
    for (const token of raw.split(',')) {
      const result = schema.safeParse(token);
      if (result.success) for (const value of result.data ?? []) values.add(value);
    }
  }
  return [...values] as ListFilters[K];
}

/** Reads the list state out of the URL, falling back to defaults for anything invalid. */
export function filtersFromParams(params: URLSearchParams): ListFilters {
  const shape = employeeListQuerySchema.shape;
  const filters: ListFilters = {
    status:
      (pick(params, 'status', shape.status) as ListFilters['status'] | undefined) ??
      DEFAULT_FILTERS.status,
    sortBy:
      (pick(params, 'sortBy', shape.sortBy) as ListFilters['sortBy'] | undefined) ??
      DEFAULT_FILTERS.sortBy,
    sortOrder:
      (pick(params, 'sortOrder', shape.sortOrder) as ListFilters['sortOrder'] | undefined) ??
      DEFAULT_FILTERS.sortOrder,
    country: pickAll(params, 'country'),
    department: pickAll(params, 'department'),
    level: pickAll(params, 'level'),
    page: DEFAULT_FILTERS.page,
  };
  const search = pick(params, 'search', shape.search) as string | undefined;
  const page = Number(params.get('page'));
  if (search) filters.search = search;
  if (Number.isInteger(page) && page > 1) filters.page = page;
  return filters;
}

/** One repeated param per value, e.g. `country=IN&country=DE`. */
function appendMultiValues(params: URLSearchParams, filters: ListFilters) {
  for (const key of MULTI_VALUE_KEYS) {
    for (const value of filters[key]) params.append(key, String(value));
  }
}

/** The inverse of filtersFromParams. Defaults are left out so the URL stays short. */
export function paramsFromFilters(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  appendMultiValues(params, filters);
  if (filters.status !== DEFAULT_FILTERS.status) params.set('status', filters.status);
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder !== DEFAULT_FILTERS.sortOrder) params.set('sortOrder', filters.sortOrder);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/** Query string for GET /api/employees, always fully explicit. */
export function listApiQuery(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  appendMultiValues(params, filters);
  params.set('status', filters.status);
  params.set('sortBy', filters.sortBy);
  params.set('sortOrder', filters.sortOrder);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String((filters.page - 1) * PAGE_SIZE));
  return params;
}

/** A plain download link: `filtered` matches the list's search, filters and sort; `all` is everyone. */
export function exportHref(scope: 'filtered' | 'all', filters?: ListFilters): string {
  const params = new URLSearchParams({ scope });
  if (scope === 'filtered' && filters) {
    const query = listApiQuery(filters);
    for (const key of [
      'search',
      'country',
      'department',
      'level',
      'status',
      'sortBy',
      'sortOrder',
    ]) {
      for (const value of query.getAll(key)) params.append(key, value);
    }
  }
  return `/api/employees/export?${params.toString()}`;
}

/** The part of the list's filters a bulk revision accepts. Inactive staff are always skipped. */
export function bulkFilterFrom(filters: ListFilters): NonNullable<BulkPreviewBody['filter']> {
  return {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.country.length > 0 ? { country: filters.country } : {}),
    ...(filters.department.length > 0 ? { department: filters.department } : {}),
    ...(filters.level.length > 0 ? { level: filters.level } : {}),
  };
}
