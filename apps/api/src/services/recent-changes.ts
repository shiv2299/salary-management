import type { DbHandle } from '../db/client';
import { trailingWindowStart } from '../domain/trailing-window';
import { findBatchesByIds } from '../repositories/salary-revision-batches';
import { listChangeDetails, listChangeEntries } from '../repositories/salary-history';

export interface RecentChangesQuery {
  /** Today as `yyyy-mm-dd`, from the injected clock. */
  today: string;
  years: 3 | 5;
  limit: number;
  offset: number;
}

/**
 * Salary changes that took effect in the trailing window, newest first. A bulk revision is one
 * entry; deactivated employees are included and marked. Offset-paginated over the entries.
 */
export function getRecentChanges(
  db: DbHandle,
  { today, years, limit, offset }: RecentChangesQuery,
) {
  const windowStart = trailingWindowStart(today, years);
  const { entries, total } = listChangeEntries(
    db,
    { from: windowStart, to: today },
    { limit, offset },
  );

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

  return { years, windowStart, total, limit, offset, items };
}
