import type { DbHandle } from '../db/client';
import { BASE_CURRENCY, convert } from '../domain/fx';
import { historyChangeBp } from '../domain/history-change';
import { summariseHistory } from '../domain/history-summary';
import { notFound } from '../errors';
import { findEmployeeListRow } from '../repositories/employees';
import { loadLatestFxRates } from '../repositories/fx-rates';
import { listSalaryHistoryNewestFirst } from '../repositories/salary-history';
import { toEmployeeListItem } from './employee-list';

export function getEmployeeDetail(db: DbHandle, id: number, today: string) {
  const row = findEmployeeListRow(db, id);
  if (!row) throw notFound('EMPLOYEE_NOT_FOUND', `Employee ${id} not found`);

  const history = listSalaryHistoryNewestFirst(db, id);
  const rates = loadLatestFxRates(db);
  const changeBp = historyChangeBp(history, rates);

  return {
    ...toEmployeeListItem(row),
    deactivatedOn: row.deactivatedOn,
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
      amountBaseMinor: convert(h.amountMinor, h.currencyCode, BASE_CURRENCY, rates),
    })),
    historySummary: summariseHistory(history, rates, row.deactivatedOn ?? today),
  };
}
