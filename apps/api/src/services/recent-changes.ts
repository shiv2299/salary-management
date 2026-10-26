import type { RecentChangesResponse } from '@acme/shared';
import type { DbHandle } from '../db/client';
import { trailingWindowStart } from '../domain/trailing-window';
import { findBatchesByIds } from '../repositories/salary-revision-batches';
import type { SalaryHistoryRow } from '../db/schema';
import {
  listChangeDetails,
  listChangeEntries,
  listChangeYears,
} from '../repositories/salary-history';

export interface RecentChangesQuery {
  /** Today as `yyyy-mm-dd`, from the injected clock. */
  today: string;
  range: RecentChangesResponse['range'];
  /** A calendar year; overrides the range. */
  year?: number | undefined;
  reason?: SalaryHistoryRow['reason'][] | undefined;
  limit: number;
  offset: number;
}

const RANGE_YEARS = { '3y': 3, '5y': 5, '10y': 10 } as const;

function windowFor({ today, range, year }: Pick<RecentChangesQuery, 'today' | 'range' | 'year'>) {
  if (year !== undefined) {
    const yearEnd = `${String(year).padStart(4, '0')}-12-31`;
    return {
      from: `${String(year).padStart(4, '0')}-01-01`,
      to: yearEnd < today ? yearEnd : today,
    };
  }
  return {
    from: range === 'all' ? null : trailingWindowStart(today, RANGE_YEARS[range]),
    to: today,
  };
}

/**
 * Salary changes that took effect in the range or calendar year, newest first. A bulk revision is one
 * entry; deactivated employees are included and marked. Offset-paginated over the entries.
 */
export function getRecentChanges(
  db: DbHandle,
  { today, range, year, reason, limit, offset }: RecentChangesQuery,
): RecentChangesResponse {
  const window = windowFor({ today, range, year });
  // A window that starts after it ends (a year not yet begun) has no entries.
  const empty = window.from !== null && window.from > window.to;
  const { entries, total } = empty
    ? { entries: [], total: 0 }
    : listChangeEntries(db, window, { limit, offset }, reason);

  const individualRowIds = entries.filter((e) => e.batchId === null).map((e) => e.lastRowId);
  const details = new Map(listChangeDetails(db, individualRowIds).map((d) => [d.historyId, d]));
  const batches = new Map(
    findBatchesByIds(
      db,
      entries.flatMap((e) => (e.batchId === null ? [] : [e.batchId])),
    ).map((b) => [b.id, b]),
  );

  const items = entries.map((entry) => {
    if (entry.batchId !== null) {
      const batch = batches.get(entry.batchId);
      if (!batch) throw new Error(`Revision batch ${entry.batchId} not found`);
      return {
        kind: 'batch' as const,
        batchId: batch.id,
        effectiveDate: entry.effectiveDate,
        headcount: entry.headcount,
        percentageBp: batch.percentageBp,
        note: batch.note,
      };
    }
    const row = details.get(entry.lastRowId);
    if (!row) throw new Error(`Salary history row ${entry.lastRowId} not found`);
    return {
      kind: 'individual' as const,
      historyId: row.historyId,
      effectiveDate: row.effectiveDate,
      reason: row.reason,
      employee: {
        id: row.employeeId,
        firstName: row.firstName,
        lastName: row.lastName,
        countryCode: row.countryCode,
        status: row.employeeStatus,
      },
      from:
        row.previousAmountMinor === null || row.previousCurrencyCode === null
          ? null
          : { amountMinor: row.previousAmountMinor, currencyCode: row.previousCurrencyCode },
      to: { amountMinor: row.amountMinor, currencyCode: row.currencyCode },
    };
  });

  return {
    range,
    year: year ?? null,
    windowStart: window.from,
    windowEnd: window.to,
    availableYears: listChangeYears(db),
    total,
    limit,
    offset,
    items,
  };
}
