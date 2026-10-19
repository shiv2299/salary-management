import { desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import {
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
