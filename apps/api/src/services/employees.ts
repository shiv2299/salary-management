import type { DbHandle } from '../db/client';
import { listCountries } from '../repositories/countries';
import { insertEmployeeWithPlaceholderSalary } from '../repositories/employees';
import { applySalaryChanges, type SalaryWriterDeps } from './salary-writer';

export interface NewEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  departmentId: number;
  levelId: number;
  jobTitle: string;
  hireDate: string;
  /** Initial annual salary in the minor units of the country's currency. */
  amountMinor: number;
}

/**
 * Creates employees, each with its initial `hire` salary row, in one transaction. Used by
 * `POST /api/employees` (a batch of one) and by the seed script. Returns the new ids in input order.
 */
export function createEmployees(
  db: DbHandle,
  inputs: NewEmployeeInput[],
  deps: SalaryWriterDeps,
): number[] {
  return db.transaction((tx) => {
    const currencyByCountry = new Map(listCountries(tx).map((c) => [c.code, c.currencyCode]));
    const now = deps.now();

    const ids = inputs.map((input) => {
      if (!currencyByCountry.has(input.countryCode)) {
        throw new Error(`Unknown country: ${input.countryCode}`);
      }
      return insertEmployeeWithPlaceholderSalary(tx, {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        countryCode: input.countryCode,
        departmentId: input.departmentId,
        levelId: input.levelId,
        jobTitle: input.jobTitle,
        hireDate: input.hireDate,
        createdAt: now,
        updatedAt: now,
      });
    });

    applySalaryChanges(
      tx,
      inputs.map((input, i) => ({
        employeeId: ids[i]!,
        reason: 'hire' as const,
        amountMinor: input.amountMinor,
        currencyCode: currencyByCountry.get(input.countryCode)!,
        effectiveDate: input.hireDate,
      })),
      deps,
    );

    return ids;
  });
}
