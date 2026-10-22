import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { employees, salaryHistory } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import {
  createEmployee,
  createEmployees,
  deactivateEmployee,
  reactivateEmployee,
  updateEmployee,
  type NewEmployeeInput,
} from './employees';
import { applySalaryChanges } from './salary-writer';

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

describe('createEmployee', () => {
  const today = { now: () => FIXED_NOW };

  function failure(overrides: Partial<NewEmployeeInput>) {
    try {
      createEmployee(database.db, input(overrides), today);
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it('creates the employee and returns its id', () => {
    const id = createEmployee(database.db, input(), today);

    const employee = database.db.select().from(employees).where(eq(employees.id, id)).get();
    expect(employee).toMatchObject({ email: 'asha@acme.test', currentReason: 'hire' });
  });

  it('rejects a hire date in the future', () => {
    const error = failure({ hireDate: '2026-01-16' });

    expect(error).toMatchObject({ statusCode: 422, code: 'INVALID_EMPLOYEE' });
    expect((error as Error).message).toContain('hire date');
  });

  it('accepts a hire date of today', () => {
    expect(failure({ hireDate: '2026-01-15' })).toBeUndefined();
  });

  it('rejects an unknown country, department or level', () => {
    expect(failure({ countryCode: 'FR' })).toMatchObject({ statusCode: 422 });
    expect(failure({ departmentId: 99 })).toMatchObject({ statusCode: 422 });
    expect(failure({ levelId: 99 })).toMatchObject({ statusCode: 422 });
  });

  it('rejects an email that another employee already has, ignoring case', () => {
    createEmployee(database.db, input({ email: 'asha@acme.test' }), today);

    expect(failure({ email: 'ASHA@acme.test' })).toMatchObject({
      statusCode: 409,
      code: 'EMAIL_TAKEN',
    });
  });

  it('creates nothing when the request is rejected', () => {
    failure({ countryCode: 'FR' });

    expect(database.db.select().from(employees).all()).toHaveLength(0);
  });
});

describe('updateEmployee', () => {
  const later = { now: () => '2026-02-01T09:00:00.000Z' };
  const at = (iso: string) => ({ now: () => iso });
  const deactivatedOn = (id: number) =>
    database.db.select().from(employees).where(eq(employees.id, id)).get()?.deactivatedOn;

  it('records the deactivation date from the clock and clears it on reactivation', () => {
    const id = createEmployee(database.db, input(), deps);
    expect(deactivatedOn(id)).toBeNull();
    deactivateEmployee(database.db, id, at('2026-02-01T09:00:00.000Z'));
    expect(deactivatedOn(id)).toBe('2026-02-01');
    reactivateEmployee(database.db, id, at('2026-03-01T09:00:00.000Z'));
    expect(deactivatedOn(id)).toBeNull();
  });

  it('keeps the first date when an inactive employee is deactivated again, and records a new one after reactivating', () => {
    const id = createEmployee(database.db, input(), deps);
    deactivateEmployee(database.db, id, at('2026-02-01T09:00:00.000Z'));
    deactivateEmployee(database.db, id, at('2026-02-10T09:00:00.000Z'));
    expect(deactivatedOn(id)).toBe('2026-02-01');
    reactivateEmployee(database.db, id, at('2026-03-01T09:00:00.000Z'));
    deactivateEmployee(database.db, id, at('2026-04-15T09:00:00.000Z'));
    expect(deactivatedOn(id)).toBe('2026-04-15');
  });

  function row(id: number) {
    return database.db.select().from(employees).where(eq(employees.id, id)).get()!;
  }

  it('changes only the fields given and stamps updated_at', () => {
    const id = createEmployee(database.db, input(), deps);

    updateEmployee(database.db, id, { jobTitle: 'Staff Engineer', departmentId: 1 }, later);

    expect(row(id)).toMatchObject({
      jobTitle: 'Staff Engineer',
      firstName: 'Asha',
      email: 'asha@acme.test',
      updatedAt: '2026-02-01T09:00:00.000Z',
    });
  });

  it('keeps the salary, level and country untouched', () => {
    const id = createEmployee(database.db, input(), deps);
    const before = row(id);

    updateEmployee(database.db, id, { lastName: 'Menon' }, later);

    expect(row(id)).toMatchObject({
      levelId: before.levelId,
      countryCode: before.countryCode,
      currentAmountMinor: before.currentAmountMinor,
      currentAmountBaseMinor: before.currentAmountBaseMinor,
    });
  });

  it('allows an employee to keep their own email', () => {
    const id = createEmployee(database.db, input(), deps);

    expect(() => updateEmployee(database.db, id, { email: 'asha@acme.test' }, later)).not.toThrow();
  });

  it('rejects an email another employee has', () => {
    createEmployee(database.db, input({ email: 'taken@acme.test' }), deps);
    const id = createEmployee(database.db, input(), deps);

    expect(() => updateEmployee(database.db, id, { email: 'taken@acme.test' }, later)).toThrowError(
      expect.objectContaining({ statusCode: 409, code: 'EMAIL_TAKEN' }),
    );
  });

  it('rejects an unknown department', () => {
    const id = createEmployee(database.db, input(), deps);

    expect(() => updateEmployee(database.db, id, { departmentId: 99 }, later)).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it('throws a 404 for an unknown employee', () => {
    expect(() => updateEmployee(database.db, 999, { jobTitle: 'x' }, later)).toThrowError(
      expect.objectContaining({ statusCode: 404, code: 'EMPLOYEE_NOT_FOUND' }),
    );
  });
});

describe('deactivateEmployee and reactivateEmployee', () => {
  const later = { now: () => '2026-02-01T09:00:00.000Z' };

  it('deactivates without touching the salary history, and reactivates', () => {
    const id = createEmployee(database.db, input(), deps);
    applySalaryChanges(
      database.db,
      [
        {
          employeeId: id,
          reason: 'raise',
          amountMinor: 600_000_000,
          currencyCode: 'INR',
          effectiveDate: '2022-01-01',
        },
      ],
      deps,
    );

    deactivateEmployee(database.db, id, later);

    const inactive = database.db.select().from(employees).where(eq(employees.id, id)).get()!;
    expect(inactive).toMatchObject({
      status: 'inactive',
      currentAmountMinor: 600_000_000,
      updatedAt: '2026-02-01T09:00:00.000Z',
    });
    expect(database.db.select().from(salaryHistory).all()).toHaveLength(2);

    reactivateEmployee(database.db, id, later);

    expect(database.db.select().from(employees).where(eq(employees.id, id)).get()?.status).toBe(
      'active',
    );
  });

  it('is idempotent and throws a 404 for an unknown employee', () => {
    const id = createEmployee(database.db, input(), deps);

    deactivateEmployee(database.db, id, later);

    expect(() => deactivateEmployee(database.db, id, later)).not.toThrow();
    expect(() => reactivateEmployee(database.db, 999, later)).toThrowError(
      expect.objectContaining({ statusCode: 404 }),
    );
  });
});
