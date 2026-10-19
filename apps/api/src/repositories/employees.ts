import { count, eq, inArray } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import { employees, type Employee, type NewEmployee } from '../db/schema';

export function findEmployeesByIds(db: DbHandle, ids: number[]): Employee[] {
  if (ids.length === 0) return [];
  return db.select().from(employees).where(inArray(employees.id, ids)).all();
}

type CurrentSalaryColumnName =
  | 'currentAmountMinor'
  | 'currentCurrencyCode'
  | 'currentAmountBaseMinor'
  | 'currentEffectiveDate'
  | 'currentReason';

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

/**
 * Inserts the employee with placeholder `current_*` values. Only the single salary writer gives
 * them real values, so callers must follow this with a hire change in the same transaction.
 */
export function insertEmployeeWithPlaceholderSalary(
  db: DbHandle,
  row: Omit<NewEmployee, CurrentSalaryColumnName | 'status'>,
): number {
  return db
    .insert(employees)
    .values({
      ...row,
      currentAmountMinor: 0,
      currentCurrencyCode: '',
      currentAmountBaseMinor: 0,
      currentEffectiveDate: row.hireDate,
      currentReason: 'hire',
    })
    .returning({ id: employees.id })
    .get().id;
}

export function countEmployees(db: DbHandle): number {
  return db.select({ value: count() }).from(employees).get()?.value ?? 0;
}

/** Status is not a salary column, so it has its own writer; it never touches `current_*`. */
export function markEmployeesInactive(db: DbHandle, ids: number[], updatedAt: string): void {
  if (ids.length === 0) return;
  db.update(employees)
    .set({ status: 'inactive', updatedAt })
    .where(inArray(employees.id, ids))
    .run();
}
