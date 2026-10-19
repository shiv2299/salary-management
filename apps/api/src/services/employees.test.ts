import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { employees, salaryHistory } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';

const deps = { now: () => FIXED_NOW };

let database: ReturnType<typeof createTestDb>;

beforeEach(() => {
  database = createTestDb();
});

function input(overrides: Partial<NewEmployeeInput> = {}): NewEmployeeInput {
  return {
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha@acme.test',
    countryCode: 'IN',
    departmentId: 1,
    levelId: 2,
    jobTitle: 'Engineer',
    hireDate: '2021-03-01',
    amountMinor: 500_000_000,
    ...overrides,
  };
}

describe('createEmployees', () => {
  it('creates an active employee whose hire row is the current salary', () => {
    const [id] = createEmployees(database.db, [input()], deps);

    const employee = database.db.select().from(employees).where(eq(employees.id, id!)).get();
    expect(employee).toMatchObject({
      firstName: 'Asha',
      status: 'active',
      levelId: 2,
      currentAmountMinor: 500_000_000,
      currentCurrencyCode: 'INR',
      currentAmountBaseMinor: 5_990_000,
      currentEffectiveDate: '2021-03-01',
      currentReason: 'hire',
      createdAt: FIXED_NOW,
    });
  });

  it('takes the salary currency from the employee country', () => {
    const [id] = createEmployees(
      database.db,
      [input({ countryCode: 'DE', amountMinor: 7_000_000 })],
      deps,
    );

    const employee = database.db.select().from(employees).where(eq(employees.id, id!)).get();
    expect(employee).toMatchObject({
      currentCurrencyCode: 'EUR',
      currentAmountBaseMinor: 7_560_000,
    });
  });

  it('writes exactly one hire history row per employee', () => {
    const ids = createEmployees(
      database.db,
      [input(), input({ email: 'ben@acme.test', firstName: 'Ben' })],
      deps,
    );

    const rows = database.db.select().from(salaryHistory).all();
    expect(rows.map((r) => [r.employeeId, r.reason, r.effectiveDate])).toEqual([
      [ids[0], 'hire', '2021-03-01'],
      [ids[1], 'hire', '2021-03-01'],
    ]);
  });

  it('returns the new ids in input order', () => {
    const ids = createEmployees(
      database.db,
      [input({ email: 'a@acme.test' }), input({ email: 'b@acme.test' })],
      deps,
    );

    expect(ids).toHaveLength(2);
    expect(ids[1]).toBeGreaterThan(ids[0]!);
  });

  it('creates nothing when one employee in the batch is invalid', () => {
    expect(() =>
      createEmployees(
        database.db,
        [input({ email: 'a@acme.test' }), input({ email: 'a@acme.test' })],
        deps,
      ),
    ).toThrow();

    expect(database.db.select().from(employees).all()).toHaveLength(0);
    expect(database.db.select().from(salaryHistory).all()).toHaveLength(0);
  });

  it('rejects an unknown country', () => {
    expect(() => createEmployees(database.db, [input({ countryCode: 'ZZ' })], deps)).toThrow(
      'Unknown country: ZZ',
    );
  });
});
