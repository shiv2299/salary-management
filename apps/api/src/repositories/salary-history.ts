import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import {
  employees,
  levels,
  salaryHistory,
  type NewSalaryHistoryRow,
  type SalaryHistoryRow,
} from '../db/schema';

export function insertSalaryHistoryRow(db: DbHandle, row: NewSalaryHistoryRow): number {
  return db.insert(salaryHistory).values(row).returning({ id: salaryHistory.id }).get().id;
}

export function listSalaryHistory(db: DbHandle, employeeId: number): SalaryHistoryRow[] {
  return db.select().from(salaryHistory).where(eq(salaryHistory.employeeId, employeeId)).all();
}

export type SalaryHistoryDetailRow = SalaryHistoryRow & { levelCode: string };

/** An employee's history, newest effective date first; the later row wins a same-day tie. */
export function listSalaryHistoryNewestFirst(
  db: DbHandle,
  employeeId: number,
): SalaryHistoryDetailRow[] {
  return db
    .select({ row: salaryHistory, levelCode: levels.code })
    .from(salaryHistory)
    .innerJoin(levels, eq(levels.id, salaryHistory.levelId))
    .where(eq(salaryHistory.employeeId, employeeId))
    .orderBy(desc(salaryHistory.effectiveDate), desc(salaryHistory.id))
    .all()
    .map(({ row, levelCode }) => ({ ...row, levelCode }));
}

export interface ChangeEntryPage {
  /** The newest history row of the entry: the row itself, or the last row of a bulk revision. */
  lastRowId: number;
  effectiveDate: string;
  batchId: number | null;
  headcount: number;
}

/**
 * Salary changes effective within [from, to], grouped into entries: all rows sharing a batch are
 * one entry and every other row is its own. Newest effective date first; offset-paginated over
 * the entries, with the total number of entries.
 */
export function listChangeEntries(
  db: DbHandle,
  window: { from: string; to: string },
  page: { limit: number; offset: number },
): { entries: ChangeEntryPage[]; total: number } {
  const inWindow = and(
    gte(salaryHistory.effectiveDate, window.from),
    lte(salaryHistory.effectiveDate, window.to),
  );
  // Batch ids are positive, so a negative row id can never collide with one.
  const entryKey = sql`coalesce(${salaryHistory.batchId}, -${salaryHistory.id})`;
  const lastRowId = sql<number>`max(${salaryHistory.id})`;
  const effectiveDate = sql<string>`max(${salaryHistory.effectiveDate})`;

  const total =
    db
      .select({ value: sql<number>`count(distinct ${entryKey})` })
      .from(salaryHistory)
      .where(inWindow)
      .get()?.value ?? 0;
  const entries = db
    .select({
      lastRowId,
      effectiveDate,
      batchId: sql<number | null>`max(${salaryHistory.batchId})`,
      headcount: sql<number>`count(*)`,
    })
    .from(salaryHistory)
    .where(inWindow)
    .groupBy(entryKey)
    .orderBy(desc(effectiveDate), desc(lastRowId))
    .limit(page.limit)
    .offset(page.offset)
    .all();
  return { entries, total };
}

export interface ChangeDetailRow {
  historyId: number;
  effectiveDate: string;
  reason: SalaryHistoryRow['reason'];
  amountMinor: number;
  currencyCode: string;
  /** The country in force from this row onward. */
  countryCode: string;
  employeeId: number;
  firstName: string;
  lastName: string;
  employeeStatus: 'active' | 'inactive';
  /** The employee's pay on the row before this one, or null for the first row (the hire). */
  previousAmountMinor: number | null;
  previousCurrencyCode: string | null;
}

/** The row before this one: the latest earlier effective date, the earlier id winning a tie. */
function previousRowValue<T>(column: 'amount_minor' | 'currency_code') {
  return sql<T | null>`(select ${sql.raw(`p.${column}`)} from salary_history p
    where p.employee_id = ${salaryHistory.employeeId}
      and (p.effective_date < ${salaryHistory.effectiveDate}
        or (p.effective_date = ${salaryHistory.effectiveDate} and p.id < ${salaryHistory.id}))
    order by p.effective_date desc, p.id desc
    limit 1)`;
}

export function listChangeDetails(db: DbHandle, historyIds: number[]): ChangeDetailRow[] {
  if (historyIds.length === 0) return [];
  return db
    .select({
      historyId: salaryHistory.id,
      effectiveDate: salaryHistory.effectiveDate,
      reason: salaryHistory.reason,
      amountMinor: salaryHistory.amountMinor,
      currencyCode: salaryHistory.currencyCode,
      countryCode: salaryHistory.countryCode,
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employeeStatus: employees.status,
      previousAmountMinor: previousRowValue<number>('amount_minor'),
      previousCurrencyCode: previousRowValue<string>('currency_code'),
    })
    .from(salaryHistory)
    .innerJoin(employees, eq(employees.id, salaryHistory.employeeId))
    .where(inArray(salaryHistory.id, historyIds))
    .all();
}

/** Every history row of every employee, ordered by employee, effective date and id. */
export function listAllSalaryHistory(db: DbHandle) {
  return db
    .select({
      id: salaryHistory.id,
      employeeId: salaryHistory.employeeId,
      effectiveDate: salaryHistory.effectiveDate,
      reason: salaryHistory.reason,
      amountMinor: salaryHistory.amountMinor,
      currencyCode: salaryHistory.currencyCode,
      countryCode: salaryHistory.countryCode,
    })
    .from(salaryHistory)
    .orderBy(asc(salaryHistory.employeeId), asc(salaryHistory.effectiveDate), asc(salaryHistory.id))
    .all();
}

/** The latest raise or promotion date per employee who has one. */
export function listLastIncreaseDates(
  db: DbHandle,
): { employeeId: number; lastIncreaseOn: string }[] {
  return db
    .select({
      employeeId: salaryHistory.employeeId,
      lastIncreaseOn: sql<string>`max(${salaryHistory.effectiveDate})`,
    })
    .from(salaryHistory)
    .where(inArray(salaryHistory.reason, ['raise', 'promotion']))
    .groupBy(salaryHistory.employeeId)
    .all();
}
