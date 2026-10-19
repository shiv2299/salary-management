import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import {
  departments,
  employees,
  levels,
  type Employee,
  type EmployeeStatus,
  type NewEmployee,
} from '../db/schema';

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

export interface EmployeeListFilter {
  country?: string;
  department?: number;
  level?: number;
  status: EmployeeStatus | 'all';
  search?: string;
}

export interface EmployeeListPage {
  sortBy: 'name' | 'salary' | 'hireDate';
  sortOrder: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export type EmployeeListRow = Employee & { departmentName: string; levelCode: string };

const LIKE_ESCAPE = '\\';

/** Makes `%`, `_` and the escape character match themselves inside a LIKE pattern. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => LIKE_ESCAPE + char);
}

function listWhere(filter: EmployeeListFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.status !== 'all') conditions.push(eq(employees.status, filter.status));
  if (filter.country) conditions.push(eq(employees.countryCode, filter.country));
  if (filter.department !== undefined)
    conditions.push(eq(employees.departmentId, filter.department));
  if (filter.level !== undefined) conditions.push(eq(employees.levelId, filter.level));
  if (filter.search) {
    // Unindexed substring scan on purpose; see docs/decisions.md ("Search").
    const pattern = `%${escapeLike(filter.search)}%`;
    conditions.push(sql`(
      ${employees.firstName} || ' ' || ${employees.lastName} like ${pattern} escape '\\'
      or ${employees.email} like ${pattern} escape '\\'
      or ${employees.jobTitle} like ${pattern} escape '\\'
    )`);
  }
  return and(...conditions);
}

function listOrderBy({ sortBy, sortOrder }: EmployeeListPage): SQL[] {
  const direction = sortOrder === 'asc' ? asc : desc;
  // The trailing id keeps pages stable when the sort values tie.
  switch (sortBy) {
    case 'salary':
      return [direction(employees.currentAmountBaseMinor), asc(employees.id)];
    case 'hireDate':
      return [direction(employees.hireDate), asc(employees.id)];
    case 'name':
      return [direction(employees.lastName), direction(employees.firstName), asc(employees.id)];
  }
}

function selectEmployeeRows(db: DbHandle) {
  return db
    .select({
      employee: employees,
      departmentName: departments.name,
      levelCode: levels.code,
    })
    .from(employees)
    .innerJoin(departments, eq(departments.id, employees.departmentId))
    .innerJoin(levels, eq(levels.id, employees.levelId));
}

function toListRow(row: {
  employee: Employee;
  departmentName: string;
  levelCode: string;
}): EmployeeListRow {
  return { ...row.employee, departmentName: row.departmentName, levelCode: row.levelCode };
}

export function listEmployeeRows(
  db: DbHandle,
  filter: EmployeeListFilter,
  page: EmployeeListPage,
): { rows: EmployeeListRow[]; total: number } {
  const where = listWhere(filter);
  const total = db.select({ value: count() }).from(employees).where(where).get()?.value ?? 0;
  const rows = selectEmployeeRows(db)
    .where(where)
    .orderBy(...listOrderBy(page))
    .limit(page.limit)
    .offset(page.offset)
    .all()
    .map(toListRow);
  return { rows, total };
}

export function findEmployeeListRow(db: DbHandle, id: number): EmployeeListRow | undefined {
  const row = selectEmployeeRows(db).where(eq(employees.id, id)).get();
  return row && toListRow(row);
}
