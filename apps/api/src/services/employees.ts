import type { DbHandle } from '../db/client';
import type { Employee } from '../db/schema';
import { listCountries } from '../repositories/countries';
import { conflict, notFound, unprocessable } from '../errors';
import { listDepartments } from '../repositories/departments';
import {
  findEmployeeIdByEmail,
  findEmployeesByIds,
  insertEmployeeWithPlaceholderSalary,
  setEmployeeStatus,
  updateEmployeeProfile,
  type EmployeeProfileFields,
} from '../repositories/employees';
import { listLevels } from '../repositories/levels';
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

/** Validates one new employee against the business rules, then creates it. Returns the new id. */
export function createEmployee(
  db: DbHandle,
  input: NewEmployeeInput,
  deps: SalaryWriterDeps,
): number {
  return db.transaction((tx) => {
    const violations: string[] = [];
    if (input.hireDate > deps.now().slice(0, 10)) {
      violations.push('hire date must not be in the future');
    }
    if (!listCountries(tx).some((c) => c.code === input.countryCode)) {
      violations.push(`unknown country: ${input.countryCode}`);
    }
    if (!listDepartments(tx).some((d) => d.id === input.departmentId)) {
      violations.push(`unknown department: ${input.departmentId}`);
    }
    if (!listLevels(tx).some((l) => l.id === input.levelId)) {
      violations.push(`unknown level: ${input.levelId}`);
    }
    if (violations.length > 0) throw unprocessable('INVALID_EMPLOYEE', violations.join('; '));

    if (findEmployeeIdByEmail(tx, input.email) !== undefined) {
      throw conflict('EMAIL_TAKEN', `An employee with email ${input.email} already exists`);
    }

    return createEmployees(tx, [input], deps)[0]!;
  });
}

function requireEmployee(db: DbHandle, id: number): Employee {
  const employee = findEmployeesByIds(db, [id])[0];
  if (!employee) throw notFound('EMPLOYEE_NOT_FOUND', `Employee ${id} not found`);
  return employee;
}

/** Edits profile fields only; country, level and salary change through salary changes. */
export function updateEmployee(
  db: DbHandle,
  id: number,
  fields: EmployeeProfileFields,
  deps: SalaryWriterDeps,
): void {
  db.transaction((tx) => {
    requireEmployee(tx, id);

    if (fields.departmentId !== undefined) {
      const departmentId = fields.departmentId;
      if (!listDepartments(tx).some((d) => d.id === departmentId)) {
        throw unprocessable('INVALID_EMPLOYEE', `unknown department: ${departmentId}`);
      }
    }
    if (fields.email !== undefined) {
      const owner = findEmployeeIdByEmail(tx, fields.email);
      if (owner !== undefined && owner !== id) {
        throw conflict('EMAIL_TAKEN', `An employee with email ${fields.email} already exists`);
      }
    }

    updateEmployeeProfile(tx, id, fields, deps.now());
  });
}

/** Soft delete: the salary history stays, and the employee can be reactivated. */
export function deactivateEmployee(db: DbHandle, id: number, deps: SalaryWriterDeps): void {
  const employee = requireEmployee(db, id);
  if (employee.status === 'inactive') return;
  const now = deps.now();
  setEmployeeStatus(db, id, 'inactive', now.slice(0, 10), now);
}

export function reactivateEmployee(db: DbHandle, id: number, deps: SalaryWriterDeps): void {
  requireEmployee(db, id);
  setEmployeeStatus(db, id, 'active', null, deps.now());
}
