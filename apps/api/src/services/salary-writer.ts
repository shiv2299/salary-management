import type { DbHandle } from '../db/client';
import type { SalaryReason } from '../db/schema';
import { selectCurrentRow } from '../domain/current-salary';
import { BASE_CURRENCY, convert } from '../domain/fx';
import { findEmployeesByIds, updateCurrentSalary } from '../repositories/employees';
import { loadLatestFxRates } from '../repositories/fx-rates';
import { insertSalaryHistoryRow, listSalaryHistory } from '../repositories/salary-history';

export interface SalaryChange {
  employeeId: number;
  reason: SalaryReason;
  amountMinor: number;
  currencyCode: string;
  effectiveDate: string;
  /** New level, for a promotion or a level correction. Otherwise the level in force is kept. */
  levelId?: number;
  /** New country, for a relocation. Otherwise the country in force is kept. */
  countryCode?: string;
  batchId?: number;
}

export interface SalaryWriterDeps {
  now: () => string;
}

/**
 * The only writer of `salary_history` and of the employees' `current_*`, `level_id` and
 * `country_code` columns (architecture §1). Every change is appended to history; the employee's
 * cache is then recomputed from the current history row, so a backdated change never alters
 * current pay and a same-day correction wins. All changes commit together or not at all, and
 * the call joins an enclosing transaction when there is one. Business rules are validated by
 * the callers; this function trusts them.
 *
 * Returns the new history row ids, in input order.
 */
export function applySalaryChanges(
  db: DbHandle,
  changes: SalaryChange[],
  deps: SalaryWriterDeps,
): number[] {
  return db.transaction((tx) => {
    const employeesById = new Map(
      findEmployeesByIds(tx, [...new Set(changes.map((c) => c.employeeId))]).map((e) => [e.id, e]),
    );
    const rates = loadLatestFxRates(tx);
    const now = deps.now();
    const ids: number[] = [];

    for (const change of changes) {
      const employee = employeesById.get(change.employeeId);
      if (!employee) throw new Error(`Employee ${change.employeeId} not found`);

      // The level and country in force at the change's effective date.
      const inForce = listSalaryHistory(tx, employee.id).filter(
        (row) => row.effectiveDate <= change.effectiveDate,
      );
      const before = inForce.length > 0 ? selectCurrentRow(inForce) : employee;

      ids.push(
        insertSalaryHistoryRow(tx, {
          employeeId: employee.id,
          amountMinor: change.amountMinor,
          currencyCode: change.currencyCode,
          effectiveDate: change.effectiveDate,
          reason: change.reason,
          levelId: change.levelId ?? before.levelId,
          countryCode: change.countryCode ?? before.countryCode,
          batchId: change.batchId ?? null,
          createdAt: now,
        }),
      );

      const current = selectCurrentRow(listSalaryHistory(tx, employee.id));
      updateCurrentSalary(tx, employee.id, {
        levelId: current.levelId,
        countryCode: current.countryCode,
        currentAmountMinor: current.amountMinor,
        currentCurrencyCode: current.currencyCode,
        currentAmountBaseMinor: convert(
          current.amountMinor,
          current.currencyCode,
          BASE_CURRENCY,
          rates,
        ),
        currentEffectiveDate: current.effectiveDate,
        currentReason: current.reason,
        updatedAt: now,
      });
    }

    return ids;
  });
}
