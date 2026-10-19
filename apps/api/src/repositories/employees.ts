import { eq, inArray } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import { employees, type Employee } from '../db/schema';

export function findEmployeesByIds(db: DbHandle, ids: number[]): Employee[] {
  if (ids.length === 0) return [];
  return db.select().from(employees).where(inArray(employees.id, ids)).all();
}

export type CurrentSalaryColumns = Pick<
  Employee,
  | 'levelId'
  | 'countryCode'
  | 'currentAmountMinor'
  | 'currentCurrencyCode'
  | 'currentAmountBaseMinor'
  | 'currentEffectiveDate'
  | 'currentReason'
  | 'updatedAt'
>;

export function updateCurrentSalary(db: DbHandle, id: number, columns: CurrentSalaryColumns): void {
  db.update(employees).set(columns).where(eq(employees.id, id)).run();
}
