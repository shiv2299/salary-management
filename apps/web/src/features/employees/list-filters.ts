import { DEFAULT_PAGE_SIZE, employeeListQuerySchema } from '@acme/shared';

export const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export interface ListFilters {
  search?: string;
  country?: string;
  department?: number;
  level?: number;
  status: 'active' | 'inactive' | 'all';
  sortBy: 'name' | 'salary' | 'hireDate';
  sortOrder: 'asc' | 'desc';
  /** 1-based page number as it appears in the URL. */
  page: number;
}

const DEFAULTS = { status: 'active', sortBy: 'name', sortOrder: 'asc', page: 1 } as const;

function pick<K extends keyof ListFilters>(
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

/** Reads the list state out of the URL, falling back to defaults for anything invalid. */
export function filtersFromParams(params: URLSearchParams): ListFilters {
  const shape = employeeListQuerySchema.shape;
  const filters: ListFilters = {
    status:
      (pick(params, 'status', shape.status) as ListFilters['status'] | undefined) ??
      DEFAULTS.status,
    sortBy:
      (pick(params, 'sortBy', shape.sortBy) as ListFilters['sortBy'] | undefined) ??
      DEFAULTS.sortBy,
    sortOrder:
      (pick(params, 'sortOrder', shape.sortOrder) as ListFilters['sortOrder'] | undefined) ??
      DEFAULTS.sortOrder,
    page: DEFAULTS.page,
  };
  const search = pick(params, 'search', shape.search) as string | undefined;
  const country = pick(params, 'country', shape.country) as string | undefined;
  const department = pick(params, 'department', shape.department) as number | undefined;
  const level = pick(params, 'level', shape.level) as number | undefined;
  const page = Number(params.get('page'));
  if (search) filters.search = search;
  if (country) filters.country = country;
  if (department !== undefined) filters.department = department;
  if (level !== undefined) filters.level = level;
  if (Number.isInteger(page) && page > 1) filters.page = page;
  return filters;
}

/** The inverse of filtersFromParams. Defaults are left out so the URL stays short. */
export function paramsFromFilters(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.country) params.set('country', filters.country);
  if (filters.department !== undefined) params.set('department', String(filters.department));
  if (filters.level !== undefined) params.set('level', String(filters.level));
  if (filters.status !== DEFAULTS.status) params.set('status', filters.status);
  if (filters.sortBy !== DEFAULTS.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder !== DEFAULTS.sortOrder) params.set('sortOrder', filters.sortOrder);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

/** Query string for GET /api/employees, always fully explicit. */
export function listApiQuery(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.country) params.set('country', filters.country);
  if (filters.department !== undefined) params.set('department', String(filters.department));
  if (filters.level !== undefined) params.set('level', String(filters.level));
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
      const value = query.get(key);
      if (value !== null) params.set(key, value);
    }
  }
  return `/api/employees/export?${params.toString()}`;
}

/** The part of the list's filters a bulk revision accepts. Inactive staff are always skipped. */
export function bulkFilterFrom(filters: ListFilters) {
  return {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.country ? { country: filters.country } : {}),
    ...(filters.department !== undefined ? { department: filters.department } : {}),
    ...(filters.level !== undefined ? { level: filters.level } : {}),
  };
}
