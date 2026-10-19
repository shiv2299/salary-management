import type { DbHandle } from '../db/client';
import type { Employee } from '../db/schema';
import { selectCurrentRow } from '../domain/current-salary';
import { validateSalaryChange, type SalaryChangeInput } from '../domain/salary-change-rules';
import { notFound, unprocessable } from '../errors';
import { listCountries } from '../repositories/countries';
import { findEmployeesByIds } from '../repositories/employees';
import { listLevels } from '../repositories/levels';
import { listSalaryHistory } from '../repositories/salary-history';
import { applySalaryChanges, type SalaryWriterDeps } from './salary-writer';

/**
 * The currency the employee is paid in on `effectiveDate`: that of the history row in force then,
 * which differs from the current currency when the date is before a relocation.
 */
export function currencyInForce(db: DbHandle, employee: Employee, effectiveDate: string): string {
  const inForce = listSalaryHistory(db, employee.id).filter(
    (row) => row.effectiveDate <= effectiveDate,
  );
  return inForce.length > 0 ? selectCurrentRow(inForce).currencyCode : employee.currentCurrencyCode;
}

/**
 * Records one effective-dated change for an employee: checks the business rules in
 * `domain/salary-change-rules`, then hands the change to the single salary writer. Nothing is
 * written when any rule fails.
 */
export function recordSalaryChange(
  db: DbHandle,
  employeeId: number,
  input: SalaryChangeInput,
  deps: SalaryWriterDeps,
): void {
  db.transaction((tx) => {
    const employee = findEmployeesByIds(tx, [employeeId])[0];
    if (!employee) throw notFound('EMPLOYEE_NOT_FOUND', `Employee ${employeeId} not found`);

    const levelRanks = new Map(listLevels(tx).map((l) => [l.id, l.rank]));
    const countries = new Map(listCountries(tx).map((c) => [c.code, c]));

    const violations = validateSalaryChange(input, {
      today: deps.now().slice(0, 10),
      hireDate: employee.hireDate,
      status: employee.status,
      currentAmountMinor: employee.currentAmountMinor,
      currentCountryCode: employee.countryCode,
      currentLevelRank: levelRanks.get(employee.levelId) ?? 0,
      ...(input.newLevelId !== undefined && levelRanks.has(input.newLevelId)
        ? { newLevelRank: levelRanks.get(input.newLevelId)! }
        : {}),
    });
    if (input.newLevelId !== undefined && !levelRanks.has(input.newLevelId)) {
      violations.push(`unknown level: ${input.newLevelId}`);
    }
    if (input.newCountryCode !== undefined && !countries.has(input.newCountryCode)) {
      violations.push(`unknown country: ${input.newCountryCode}`);
    }
    if (violations.length > 0) {
      throw unprocessable('INVALID_SALARY_CHANGE', violations.join('; '));
    }

    // A relocation is paid in the new country's currency. Any other change is in the currency
    // in force on its effective date.
    const currencyCode =
      input.newCountryCode !== undefined
        ? countries.get(input.newCountryCode)!.currencyCode
        : currencyInForce(tx, employee, input.effectiveDate);

    applySalaryChanges(
      tx,
      [
        {
          employeeId,
          reason: input.reason,
          amountMinor: input.amountMinor,
          currencyCode,
          effectiveDate: input.effectiveDate,
          ...(input.newLevelId !== undefined && { levelId: input.newLevelId }),
          ...(input.newCountryCode !== undefined && { countryCode: input.newCountryCode }),
        },
      ],
      deps,
    );
  });
}
