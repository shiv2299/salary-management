import { and, asc, count, desc, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { DbHandle } from '../db/client';
import {
  countries,
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
  /** Each list matches any of its values; an empty or missing list is no filter. */
  country?: string[];
  department?: number[];
  level?: number[];
  status: EmployeeStatus | 'all';
  search?: string;
}

export interface EmployeeListPage {
  sortBy: 'name' | 'jobTitle' | 'department' | 'level' | 'country' | 'hireDate' | 'salary';
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
  if (filter.country?.length) conditions.push(inArray(employees.countryCode, filter.country));
  if (filter.department?.length)
    conditions.push(inArray(employees.departmentId, filter.department));
  if (filter.level?.length) conditions.push(inArray(employees.levelId, filter.level));
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

/** Rows that tie on the chosen key fall back to name, then id, whichever way the key runs. */
function withNameTieBreak(primary: SQL): SQL[] {
  return [primary, asc(employees.lastName), asc(employees.firstName), asc(employees.id)];
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
    case 'jobTitle':
      return withNameTieBreak(direction(employees.jobTitle));
    case 'department':
      return withNameTieBreak(direction(departments.name));
    case 'level':
      return withNameTieBreak(direction(levels.rank));
    case 'country':
      return withNameTieBreak(direction(countries.name));
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
    .innerJoin(levels, eq(levels.id, employees.levelId))
    .innerJoin(countries, eq(countries.code, employees.countryCode));
}

function toListRow(row: {
  employee: Employee;
  departmentName: string;
  levelCode: string;
}): EmployeeListRow {
  return { ...row.employee, departmentName: row.departmentName, levelCode: row.levelCode };
}

export function countEmployeeRows(db: DbHandle, filter: EmployeeListFilter): number {
  return db.select({ value: count() }).from(employees).where(listWhere(filter)).get()?.value ?? 0;
}

const FACET_COLUMNS = {
  status: employees.status,
  countryCode: employees.countryCode,
  departmentId: employees.departmentId,
  levelId: employees.levelId,
} as const;

/** How many rows the filter matches for each distinct value of `column`, in value order. */
export function countEmployeesGroupedBy(
  db: DbHandle,
  filter: EmployeeListFilter,
  column: keyof typeof FACET_COLUMNS,
): { value: string | number; count: number }[] {
  const target = FACET_COLUMNS[column];
  return db
    .select({ value: target, count: count() })
    .from(employees)
    .where(listWhere(filter))
    .groupBy(target)
    .orderBy(asc(target))
    .all();
}

export function listEmployeeRows(
  db: DbHandle,
  filter: EmployeeListFilter,
  page: EmployeeListPage,
): { rows: EmployeeListRow[]; total: number } {
  const where = listWhere(filter);
  const total = countEmployeeRows(db, filter);
  const rows = selectEmployeeRows(db)
    .where(where)
    .orderBy(...listOrderBy(page))
    .limit(page.limit)
    .offset(page.offset)
    .all()
    .map(toListRow);
  return { rows, total };
}

/** Every active employee with the names the insights show. Insights cover active staff only. */
export function listActiveEmployeeRows(db: DbHandle): EmployeeListRow[] {
  return selectEmployeeRows(db).where(eq(employees.status, 'active')).all().map(toListRow);
}

export interface PeerAmountRow {
  countryCode: string;
  levelId: number;
  amountMinor: number;
  currencyCode: string;
  amountBaseMinor: number;
}

/**
 * The pay of every active employee, with their country and level, for peer-group statistics.
 * With `keys`, only those country and level pairs are read (served by `employees_country_level_idx`).
 */
export function listActivePeerAmounts(
  db: DbHandle,
  keys?: { countryCode: string; levelId: number }[],
): PeerAmountRow[] {
  if (keys?.length === 0) return [];
  const peers = keys?.map((k) =>
    and(eq(employees.countryCode, k.countryCode), eq(employees.levelId, k.levelId)),
  );
  return db
    .select({
      countryCode: employees.countryCode,
      levelId: employees.levelId,
      amountMinor: employees.currentAmountMinor,
      currencyCode: employees.currentCurrencyCode,
      amountBaseMinor: employees.currentAmountBaseMinor,
    })
    .from(employees)
    .where(and(eq(employees.status, 'active'), peers && or(...peers)))
    .all();
}

/** Active employees matching the list's filters, in the list's default name order. */
export function listActiveEmployeeRowsMatching(
  db: DbHandle,
  filter: Omit<EmployeeListFilter, 'status'>,
): EmployeeListRow[] {
  return selectEmployeeRows(db)
    .where(listWhere({ ...filter, status: 'active' }))
    .orderBy(...listOrderBy({ sortBy: 'name', sortOrder: 'asc', limit: 0, offset: 0 }))
    .all()
    .map(toListRow);
}

/** The active employees among `ids`, in the list's default name order. Others are dropped. */
export function listActiveEmployeeRowsByIds(db: DbHandle, ids: number[]): EmployeeListRow[] {
  if (ids.length === 0) return [];
  return selectEmployeeRows(db)
    .where(and(inArray(employees.id, ids), eq(employees.status, 'active')))
    .orderBy(...listOrderBy({ sortBy: 'name', sortOrder: 'asc', limit: 0, offset: 0 }))
    .all()
    .map(toListRow);
}

/**
 * One batch of the rows the filter matches, in id order, starting after `afterId`. Callers walk
 * the whole set batch by batch, so no cursor stays open between batches (better-sqlite3 rejects
 * every other statement on the connection while one is).
 */
export function listEmployeeRowsAfterId(
  db: DbHandle,
  filter: EmployeeListFilter,
  afterId: number,
  limit: number,
): EmployeeListRow[] {
  return selectEmployeeRows(db)
    .where(and(listWhere(filter), gt(employees.id, afterId)))
    .orderBy(asc(employees.id))
    .limit(limit)
    .all()
    .map(toListRow);
}

export function findEmployeeListRow(db: DbHandle, id: number): EmployeeListRow | undefined {
  const row = selectEmployeeRows(db).where(eq(employees.id, id)).get();
  return row && toListRow(row);
}

export function findEmployeeIdByEmail(db: DbHandle, email: string): number | undefined {
  return db
    .select({ id: employees.id })
    .from(employees)
    .where(sql`lower(${employees.email}) = lower(${email})`)
    .get()?.id;
}

export interface EmployeeProfileFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  departmentId?: number;
  jobTitle?: string;
}

/** Profile fields only; salary, level and country have their own single writer. */
export function updateEmployeeProfile(
  db: DbHandle,
  id: number,
  fields: EmployeeProfileFields,
  updatedAt: string,
): void {
  db.update(employees)
    .set({ ...fields, updatedAt })
    .where(eq(employees.id, id))
    .run();
}

export function setEmployeeStatus(
  db: DbHandle,
  id: number,
  status: EmployeeStatus,
  updatedAt: string,
): void {
  db.update(employees).set({ status, updatedAt }).where(eq(employees.id, id)).run();
}
