import {
  ATTENTION_VALUES,
  DEFAULT_PAGE_SIZE,
  employeeListQuerySchema,
  MAX_FILTER_VALUES,
  type Attention,
  type BulkPreviewBody,
  type Country,
  type Department,
  type EmployeeListQueryParams,
  type Level,
} from '@acme/shared';
import { ATTENTION_LABELS } from './attention-labels';

export const PAGE_SIZE = DEFAULT_PAGE_SIZE;

/** The sort columns the API accepts; taken from its schema so the two cannot drift. */
export type SortKey = EmployeeListQueryParams['sortBy'];

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface ListFilters {
  search?: string;
  /** Empty means no filter; several values match any of them. */
  country: string[];
  department: number[];
  level: number[];
  attention: Attention[];
  status: 'active' | 'inactive' | 'all';
  sortBy: SortKey;
  sortOrder: 'asc' | 'desc';
  /** Rows per page; only the supported sizes are accepted from the URL. */
  pageSize: PageSize;
  /** 1-based page number as it appears in the URL. */
  page: number;
}

export const DEFAULT_FILTERS: ListFilters = {
  country: [],
  department: [],
  level: [],
  attention: [],
  status: 'active',
  sortBy: 'name',
  sortOrder: 'asc',
  pageSize: DEFAULT_PAGE_SIZE,
  page: 1,
};

type MultiValueKey = 'country' | 'department' | 'level' | 'attention';
const MULTI_VALUE_KEYS: MultiValueKey[] = ['country', 'department', 'level', 'attention'];

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

/**
 * Every repeated or comma-separated value of a param that the shared schema accepts, once each, up
 * to the number the API takes (it rejects more with a 400, which would blank the list).
 */
function pickAll<K extends MultiValueKey>(params: URLSearchParams, key: K): ListFilters[K] {
  const schema = employeeListQuerySchema.shape[key];
  const values = new Set<unknown>();
  for (const raw of params.getAll(key)) {
    for (const token of raw.split(',')) {
      const result = schema.safeParse(token);
      if (result.success) for (const value of result.data ?? []) values.add(value);
    }
  }
  return [...values].slice(0, MAX_FILTER_VALUES) as ListFilters[K];
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
    attention: pickAll(params, 'attention'),
    pageSize: DEFAULT_FILTERS.pageSize,
    page: DEFAULT_FILTERS.page,
  };
  const search = pick(params, 'search', shape.search) as string | undefined;
  const page = Number(params.get('page'));
  const pageSize = PAGE_SIZES.find((size) => size === Number(params.get('pageSize')));
  if (pageSize) filters.pageSize = pageSize;
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
  if (filters.pageSize !== DEFAULT_FILTERS.pageSize) {
    params.set('pageSize', String(filters.pageSize));
  }
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
  params.set('limit', String(filters.pageSize));
  params.set('offset', String((filters.page - 1) * filters.pageSize));
  return params;
}

/** Query string for GET /api/employees/facets: the search and filters, with no sort or paging. */
export function facetsApiQuery(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  appendMultiValues(params, filters);
  params.set('status', filters.status);
  return params;
}

type StatusCheck = 'active' | 'inactive';

/** The status filter as two checkboxes: both ticked is "all". */
export function statusChecks(status: ListFilters['status']): StatusCheck[] {
  return status === 'all' ? ['active', 'inactive'] : [status];
}

/** Both ticked is all statuses; none ticked falls back to the default active list. */
export function statusFromChecks(checks: readonly StatusCheck[]): ListFilters['status'] {
  const active = checks.includes('active');
  const inactive = checks.includes('inactive');
  if (active && inactive) return 'all';
  return inactive ? 'inactive' : 'active';
}

export interface FilterChip {
  key: string;
  label: string;
  /** The filter change that drops just this chip. */
  remove: Partial<ListFilters>;
}

/** One removable chip per selected value, then attention, then the status when it is not the default. */
export function filterChips(
  filters: ListFilters,
  ref: { countries: Country[]; departments: Department[]; levels: Level[] },
): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const code of filters.country) {
    chips.push({
      key: `country:${code}`,
      label: ref.countries.find((country) => country.code === code)?.name ?? code,
      remove: { country: filters.country.filter((value) => value !== code) },
    });
  }
  for (const id of filters.department) {
    chips.push({
      key: `department:${id}`,
      label: ref.departments.find((department) => department.id === id)?.name ?? String(id),
      remove: { department: filters.department.filter((value) => value !== id) },
    });
  }
  for (const id of filters.level) {
    chips.push({
      key: `level:${id}`,
      label: ref.levels.find((level) => level.id === id)?.code ?? String(id),
      remove: { level: filters.level.filter((value) => value !== id) },
    });
  }
  for (const value of ATTENTION_VALUES) {
    if (!filters.attention.includes(value)) continue;
    chips.push({
      key: `attention:${value}`,
      label: ATTENTION_LABELS[value],
      remove: { attention: filters.attention.filter((entry) => entry !== value) },
    });
  }
  if (filters.status !== DEFAULT_FILTERS.status) {
    chips.push({
      key: 'status',
      label: filters.status === 'inactive' ? 'Inactive' : 'Active and inactive',
      remove: { status: DEFAULT_FILTERS.status },
    });
  }
  return chips;
}

/** Selected values across the three filters, plus one when the status is not the default. */
export function activeFilterCount(filters: ListFilters): number {
  return (
    filters.country.length +
    filters.department.length +
    filters.level.length +
    filters.attention.length +
    Number(filters.status !== DEFAULT_FILTERS.status)
  );
}

/** True when a chip or a search narrows the list. */
export function hasActiveFilters(filters: ListFilters): boolean {
  return activeFilterCount(filters) > 0 || Boolean(filters.search);
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
      'attention',
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
    ...(filters.attention.length > 0 ? { attention: filters.attention } : {}),
  };
}
