import { beforeEach, describe, expect, it } from 'vitest';
import { count } from 'drizzle-orm';
import { salaryHistory } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { previewSalaryChange } from './salary-change-preview';

let database: ReturnType<typeof createTestDb>;
let id: number;

function input(email: string, levelId: number, amountMinor: number): NewEmployeeInput {
  return {
    firstName: 'Asha',
    lastName: 'Rao',
    email,
    countryCode: 'IN',
    departmentId: 1,
    levelId,
    jobTitle: 'Engineer',
    hireDate: '2021-03-01',
    amountMinor,
  };
}

// An IN/L1 employee on 5,000,000.00 INR plus ten IN/L2 peers.
beforeEach(() => {
  database = createTestDb();
  [id] = createEmployees(
    database.db,
    [
      input('asha@acme.test', 1, 500_000_000),
      ...Array.from({ length: 10 }, (_, i) =>
        input(`peer${i}@acme.test`, 2, 600_000_000 + i * 10_000_000),
      ),
    ],
    { now: () => FIXED_NOW },
  ) as [number];
});

function historyRows() {
  return database.db.select({ n: count() }).from(salaryHistory).get()!.n;
}

describe('previewSalaryChange', () => {
  it('applies a percentage to the current salary with the domain rounding', () => {
    expect(
      previewSalaryChange(database.db, id, { reason: 'raise', percentageBp: 333 }).proposed,
    ).toEqual({ amountMinor: 516_650_000, currencyCode: 'INR', amountBaseMinor: 6_189_467 });
  });

  it('reports the change as basis points and as USD a year', () => {
    expect(
      previewSalaryChange(database.db, id, { reason: 'raise', amountMinor: 550_000_000 }),
    ).toMatchObject({ changeBp: 1000, changeBaseMinor: 599_000 });
  });

  it('gives the current salary alongside the proposed one', () => {
    expect(
      previewSalaryChange(database.db, id, { reason: 'raise', amountMinor: 550_000_000 }).current,
    ).toEqual({ amountMinor: 500_000_000, currencyCode: 'INR', amountBaseMinor: 5_990_000 });
  });

  it('compares a relocation in USD because the currency changes', () => {
    const p = previewSalaryChange(database.db, id, {
      reason: 'relocation',
      amountMinor: 6_000_000,
      newCountryCode: 'DE',
    });

    expect(p.proposed).toEqual({
      amountMinor: 6_000_000,
      currencyCode: 'EUR',
      amountBaseMinor: 6_480_000,
    });
    expect(p.changeBp).toBe(818);
    expect(p.peer).toMatchObject({ countryCode: 'DE', headcount: 0, typical: null });
  });

  it('places the proposed amount against the peers of the new level for a promotion', () => {
    expect(
      previewSalaryChange(database.db, id, {
        reason: 'promotion',
        percentageBp: 1000,
        newLevelId: 2,
      }).peer,
    ).toMatchObject({ levelCode: 'L2', headcount: 10 });
  });

  it('rejects an unknown level or country as unprocessable and an unknown employee as not found', () => {
    const level = () =>
      previewSalaryChange(database.db, id, {
        reason: 'promotion',
        percentageBp: 500,
        newLevelId: 99,
      });
    const country = () =>
      previewSalaryChange(database.db, id, {
        reason: 'relocation',
        amountMinor: 6_000_000,
        newCountryCode: 'ZZ',
      });
    const employee = () =>
      previewSalaryChange(database.db, 999, { reason: 'raise', percentageBp: 500 });

    expect(level).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'INVALID_SALARY_CHANGE' }),
    );
    expect(country).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'INVALID_SALARY_CHANGE' }),
    );
    expect(employee).toThrow(
      expect.objectContaining({ statusCode: 404, code: 'EMPLOYEE_NOT_FOUND' }),
    );
  });

  it('reads a relocation as no change instead of failing when the current salary is zero in USD', () => {
    const [tiny] = createEmployees(database.db, [input('tiny@acme.test', 1, 1)], {
      now: () => FIXED_NOW,
    }) as [number];

    const p = previewSalaryChange(database.db, tiny, {
      reason: 'relocation',
      amountMinor: 6_000_000,
      newCountryCode: 'DE',
    });

    expect(p.current.amountBaseMinor).toBe(0);
    expect(p.changeBp).toBe(0);
  });

  it('does not write anything', () => {
    const before = historyRows();

    previewSalaryChange(database.db, id, { reason: 'raise', percentageBp: 500 });

    expect(historyRows()).toBe(before);
  });
});
