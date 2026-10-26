import type { DbHandle } from '../db/client';
import { BASE_CURRENCY } from '../domain/fx';
import { formatMinor } from '../domain/money';
import {
  listEmployeeRowsAfterId,
  type EmployeeListFilter,
  type EmployeeListRow,
} from '../repositories/employees';
import { withAttention } from './attention';
import type { EmployeeListQuery } from './employee-list';

export type EmployeeExportQuery = Omit<EmployeeListQuery, 'limit' | 'offset'> & {
  scope: 'filtered' | 'all';
};

const DEFAULT_BATCH_SIZE = 1000;
const LINE_BREAK = '\r\n';

const HEADER = [
  'id',
  'first_name',
  'last_name',
  'email',
  'country',
  'department',
  'level',
  'job_title',
  'hire_date',
  'status',
  'salary',
  'currency',
  'salary_usd',
  'salary_effective_date',
];

/** Quotes a field when needed, and defuses text a spreadsheet would run as a formula. */
function textField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function toCsvLine(row: EmployeeListRow): string {
  return (
    [
      String(row.id),
      textField(row.firstName),
      textField(row.lastName),
      textField(row.email),
      row.countryCode,
      textField(row.departmentName),
      row.levelCode,
      textField(row.jobTitle),
      row.hireDate,
      row.status,
      formatMinor(row.currentAmountMinor, row.currentCurrencyCode),
      row.currentCurrencyCode,
      formatMinor(row.currentAmountBaseMinor, BASE_CURRENCY),
      row.currentEffectiveDate,
    ].join(',') + LINE_BREAK
  );
}

/**
 * The export as chunks of CSV text. `filtered` is exactly the rows the list's search and filters
 * match, over every page; `all` ignores them and includes inactive employees. Rows are read in
 * id-ordered batches, so memory stays bounded and no database cursor is held open while a slow
 * client downloads (see docs/decisions.md).
 */
export function* exportEmployeesCsv(
  db: DbHandle,
  query: EmployeeExportQuery,
  today: string,
  { batchSize = DEFAULT_BATCH_SIZE }: { batchSize?: number } = {},
): Generator<string> {
  const { scope, country, department, level, status, search, attention } = query;
  const filter: EmployeeListFilter =
    scope === 'all'
      ? { status: 'all' }
      : withAttention(
          db,
          {
            status,
            ...(country !== undefined && { country }),
            ...(department !== undefined && { department }),
            ...(level !== undefined && { level }),
            ...(search !== undefined && { search }),
          },
          attention,
          today,
        );

  yield HEADER.join(',') + LINE_BREAK;

  let afterId = 0;
  for (;;) {
    const rows = listEmployeeRowsAfterId(db, filter, afterId, batchSize);
    if (rows.length === 0) return;
    yield rows.map(toCsvLine).join('');
    afterId = rows[rows.length - 1]!.id;
  }
}
