import { eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import { salaryHistory, type NewSalaryHistoryRow, type SalaryHistoryRow } from '../db/schema';

export function insertSalaryHistoryRow(db: DbHandle, row: NewSalaryHistoryRow): number {
  return db.insert(salaryHistory).values(row).returning({ id: salaryHistory.id }).get().id;
}

export function listSalaryHistory(db: DbHandle, employeeId: number): SalaryHistoryRow[] {
  return db.select().from(salaryHistory).where(eq(salaryHistory.employeeId, employeeId)).all();
}
