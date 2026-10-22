import type { BulkPreviewBody, Country, Department, Level } from '@acme/shared';
import { bulkFilterFrom, filtersFromParams } from '../employees/list-filters';

export const BULK_REVISION_PATH = '/employees/revisions/new';
export const MAX_PICKED_IDS = 1000;

export type BulkTarget =
  { filter: NonNullable<BulkPreviewBody['filter']> } | { employeeIds: number[] };

/** The revision screen's address: the list's own query plus the selection, as raw text. */
export function bulkRevisionHref(
  listQuery: string,
  selection: { all: true } | { ids: readonly number[] },
): string {
  const picked =
    'all' in selection ? 'select=all' : `ids=${[...selection.ids].sort((a, b) => a - b).join(',')}`;
  return `${BULK_REVISION_PATH}?${listQuery ? `${listQuery}&` : ''}${picked}`;
}

/** The selection carried in the URL; `select=all` wins over `ids`. Null when absent or invalid. */
export function selectionFromParams(params: URLSearchParams): BulkTarget | null {
  if (params.get('select') === 'all') {
    return { filter: bulkFilterFrom(filtersFromParams(params)) };
  }
  const raw = params.get('ids');
  if (!raw) return null;
  const ids = new Set<number>();
  for (const token of raw.split(',')) {
    if (!/^\d+$/.test(token)) return null;
    const id = Number(token);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    ids.add(id);
  }
  return ids.size >= 1 && ids.size <= MAX_PICKED_IDS ? { employeeIds: [...ids] } : null;
}

/** The list address with its own query, without the selection. */
export function listHrefFrom(params: URLSearchParams): string {
  const rest = new URLSearchParams(params);
  rest.delete('select');
  rest.delete('ids');
  const query = rest.toString();
  return query ? `/employees?${query}` : '/employees';
}

/** Default batch note: the filters that chose everyone, or "Selected employees" for a picked set. */
export function bulkDefaultNote(
  target: BulkTarget,
  ref: { countries: Country[]; departments: Department[]; levels: Level[] },
): string {
  if (!('filter' in target)) return 'Selected employees';
  const { department = [], level = [], country = [] } = target.filter;
  return (
    [
      ...department.map((id) => ref.departments.find((d) => d.id === id)?.name),
      ...level.map((id) => ref.levels.find((l) => l.id === id)?.code),
      ...country.map((code) => ref.countries.find((c) => c.code === code)?.name),
    ]
      .filter(Boolean)
      .join(', ') || 'All matching employees'
  );
}
