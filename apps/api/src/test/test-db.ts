import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDatabase } from '../db/client';
import { countries, departments, employees, fxRates, levels } from '../db/schema';
import type { NewEmployee } from '../db/schema';

export const FIXED_NOW = '2026-01-15T10:00:00.000Z';

let employeeSequence = 0;

/** A fresh in-memory database with the real migration applied and reference data seeded. */
export function createTestDb() {
  const database = createDatabase(':memory:');
  const { db } = database;
  migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../../drizzle') });

  db.insert(countries)
    .values([
      { code: 'IN', name: 'India', currencyCode: 'INR' },
      { code: 'US', name: 'United States', currencyCode: 'USD' },
      { code: 'DE', name: 'Germany', currencyCode: 'EUR' },
    ])
    .run();
  db.insert(departments).values({ name: 'Engineering' }).run();
  db.insert(levels)
    .values([
      { code: 'L1', label: 'Junior', rank: 1 },
      { code: 'L2', label: 'Mid', rank: 2 },
      { code: 'L3', label: 'Senior', rank: 3 },
    ])
    .run();
  db.insert(fxRates)
    .values([
      { currencyCode: 'INR', asOfDate: '2025-01-01', rateToBaseNano: 11_980_000 },
      { currencyCode: 'EUR', asOfDate: '2025-01-01', rateToBaseNano: 1_080_000_000 },
    ])
    .run();

  return database;
}

/**
 * Inserts an employee with placeholder `current_*` values. Only `applySalaryChanges` may give them
 * real values, so tests follow it with a hire change, exactly as `createEmployees` will.
 */
export function insertEmployeeRow(
  db: ReturnType<typeof createTestDb>['db'],
  overrides: Partial<NewEmployee> = {},
) {
  return db
    .insert(employees)
    .values({
      firstName: 'Asha',
      lastName: 'Rao',
      email: `employee${++employeeSequence}@acme.test`,
      countryCode: 'IN',
      departmentId: 1,
      levelId: 1,
      jobTitle: 'Engineer',
      hireDate: '2020-01-01',
      currentAmountMinor: 0,
      currentCurrencyCode: 'INR',
      currentAmountBaseMinor: 0,
      currentEffectiveDate: '2020-01-01',
      currentReason: 'hire',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      ...overrides,
    })
    .returning()
    .get();
}
