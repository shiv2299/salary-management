import type { DbHandle } from '../db/client';
import { notFound } from '../errors';
import { findEmployeeListRow } from '../repositories/employees';
import { listSalaryHistoryNewestFirst } from '../repositories/salary-history';
import { toEmployeeListItem } from './employee-list';

export function getEmployeeDetail(db: DbHandle, id: number) {
  const row = findEmployeeListRow(db, id);
  if (!row) throw notFound('EMPLOYEE_NOT_FOUND', `Employee ${id} not found`);

  return {
    ...toEmployeeListItem(row),
    history: listSalaryHistoryNewestFirst(db, id).map((h) => ({
      id: h.id,
      amountMinor: h.amountMinor,
      currencyCode: h.currencyCode,
      effectiveDate: h.effectiveDate,
      reason: h.reason,
      levelId: h.levelId,
      levelCode: h.levelCode,
      countryCode: h.countryCode,
      batchId: h.batchId,
      createdAt: h.createdAt,
    })),
  };
}
