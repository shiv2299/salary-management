import type { DbHandle } from '../db/client';
import { historyChangeBp } from '../domain/history-change';
import { notFound } from '../errors';
import { findEmployeeListRow } from '../repositories/employees';
import { loadLatestFxRates } from '../repositories/fx-rates';
import { listSalaryHistoryNewestFirst } from '../repositories/salary-history';
import { toEmployeeListItem } from './employee-list';

export function getEmployeeDetail(db: DbHandle, id: number) {
  const row = findEmployeeListRow(db, id);
  if (!row) throw notFound('EMPLOYEE_NOT_FOUND', `Employee ${id} not found`);

  const history = listSalaryHistoryNewestFirst(db, id);
  const changeBp = historyChangeBp(history, loadLatestFxRates(db));

  return {
    ...toEmployeeListItem(row),
    history: history.map((h) => ({
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
      changeBp: changeBp.get(h.id) ?? null,
    })),
  };
}
