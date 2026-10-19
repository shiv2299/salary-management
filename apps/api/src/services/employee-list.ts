import type { DbHandle } from '../db/client';
import {
  listEmployeeRows,
  type EmployeeListRow,
  type EmployeeListFilter,
  type EmployeeListPage,
} from '../repositories/employees';

export type EmployeeListQuery = EmployeeListFilter & EmployeeListPage;

export function toEmployeeListItem(row: EmployeeListRow) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    countryCode: row.countryCode,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    levelId: row.levelId,
    levelCode: row.levelCode,
    jobTitle: row.jobTitle,
    hireDate: row.hireDate,
    status: row.status,
    salary: {
      amountMinor: row.currentAmountMinor,
      currencyCode: row.currentCurrencyCode,
      amountBaseMinor: row.currentAmountBaseMinor,
      effectiveDate: row.currentEffectiveDate,
    },
  };
}

export function listEmployees(db: DbHandle, query: EmployeeListQuery) {
  const { country, department, level, status, search, ...page } = query;
  const { rows, total } = listEmployeeRows(
    db,
    {
      status,
      ...(country !== undefined && { country }),
      ...(department !== undefined && { department }),
      ...(level !== undefined && { level }),
      ...(search !== undefined && { search }),
    },
    page,
  );

  return {
    items: rows.map(toEmployeeListItem),
    total,
    limit: page.limit,
    offset: page.offset,
  };
}
