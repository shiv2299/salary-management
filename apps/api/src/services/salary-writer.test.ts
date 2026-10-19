import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { employees, salaryHistory, salaryRevisionBatches } from '../db/schema';
import { FIXED_NOW, createTestDb, insertEmployeeRow } from '../test/test-db';
import { applySalaryChanges, type SalaryChange } from './salary-writer';

const deps = { now: () => FIXED_NOW };

let database: ReturnType<typeof createTestDb>;
let employeeId: number;

beforeEach(() => {
  database = createTestDb();
  employeeId = insertEmployeeRow(database.db).id;
  applySalaryChanges(
    database.db,
    [hire({ amountMinor: 500_000_000, effectiveDate: '2020-01-01' })],
    deps,
  );
});

function hire(overrides: Partial<SalaryChange> = {}): SalaryChange {
  return {
    employeeId,
    reason: 'hire',
    amountMinor: 500_000_000,
    currencyCode: 'INR',
    effectiveDate: '2020-01-01',
    ...overrides,
  };
}

function employee() {
  return database.db.select().from(employees).where(eq(employees.id, employeeId)).get()!;
}

function history() {
  return database.db
    .select()
    .from(salaryHistory)
    .where(eq(salaryHistory.employeeId, employeeId))
    .all();
}

describe('applySalaryChanges', () => {
  it('makes the hire row the current salary and caches its USD amount', () => {
    expect(employee()).toMatchObject({
      currentAmountMinor: 500_000_000,
      currentCurrencyCode: 'INR',
      currentAmountBaseMinor: 5_990_000,
      currentEffectiveDate: '2020-01-01',
      currentReason: 'hire',
    });
    expect(history()).toHaveLength(1);
  });

  it('makes a later raise the current salary and keeps the hire row in history', () => {
    applySalaryChanges(
      database.db,
      [hire({ reason: 'raise', amountMinor: 550_000_000, effectiveDate: '2021-04-01' })],
      deps,
    );

    expect(employee()).toMatchObject({
      currentAmountMinor: 550_000_000,
      currentAmountBaseMinor: 6_589_000,
      currentEffectiveDate: '2021-04-01',
      currentReason: 'raise',
    });
    expect(history()).toHaveLength(2);
  });

  it('records a backdated change in history without changing current pay', () => {
    applySalaryChanges(
      database.db,
      [hire({ reason: 'raise', amountMinor: 550_000_000, effectiveDate: '2021-04-01' })],
      deps,
    );
    applySalaryChanges(
      database.db,
      [hire({ reason: 'raise', amountMinor: 520_000_000, effectiveDate: '2020-06-01' })],
      deps,
    );

    expect(employee()).toMatchObject({ currentAmountMinor: 550_000_000, currentReason: 'raise' });
    expect(history()).toHaveLength(3);
  });

  it('makes a correction dated the same day as the current row the new current salary', () => {
    applySalaryChanges(
      database.db,
      [hire({ reason: 'correction', amountMinor: 480_000_000, effectiveDate: '2020-01-01' })],
      deps,
    );

    expect(employee()).toMatchObject({
      currentAmountMinor: 480_000_000,
      currentReason: 'correction',
    });
    expect(history().map((row) => row.amountMinor)).toEqual([500_000_000, 480_000_000]);
  });

  it('moves the employee to the new level on a promotion and stores it on the history row', () => {
    applySalaryChanges(
      database.db,
      [
        hire({
          reason: 'promotion',
          amountMinor: 600_000_000,
          effectiveDate: '2022-01-01',
          levelId: 2,
        }),
      ],
      deps,
    );

    expect(employee()).toMatchObject({ levelId: 2, currentReason: 'promotion' });
    expect(history().at(-1)).toMatchObject({ levelId: 2, countryCode: 'IN' });
  });

  it('moves the employee to the new country and currency on a relocation', () => {
    applySalaryChanges(
      database.db,
      [
        hire({
          reason: 'relocation',
          amountMinor: 8_000_000,
          currencyCode: 'EUR',
          effectiveDate: '2022-01-01',
          countryCode: 'DE',
        }),
      ],
      deps,
    );

    expect(employee()).toMatchObject({
      countryCode: 'DE',
      currentCurrencyCode: 'EUR',
      currentAmountMinor: 8_000_000,
      currentAmountBaseMinor: 8_640_000,
    });
    expect(history().at(-1)).toMatchObject({ countryCode: 'DE', currencyCode: 'EUR' });
  });

  it('keeps the level in force at the time when a raise is backdated before a promotion', () => {
    applySalaryChanges(
      database.db,
      [
        hire({
          reason: 'promotion',
          amountMinor: 600_000_000,
          effectiveDate: '2022-01-01',
          levelId: 2,
        }),
      ],
      deps,
    );
    applySalaryChanges(
      database.db,
      [hire({ reason: 'raise', amountMinor: 520_000_000, effectiveDate: '2021-01-01' })],
      deps,
    );

    expect(history().find((row) => row.effectiveDate === '2021-01-01')).toMatchObject({
      levelId: 1,
    });
    expect(employee()).toMatchObject({ levelId: 2, currentAmountMinor: 600_000_000 });
  });

  it('applies several changes in one call and returns the new history ids', () => {
    const second = insertEmployeeRow(database.db).id;
    const ids = applySalaryChanges(
      database.db,
      [
        hire({ employeeId: second, amountMinor: 300_000_000 }),
        hire({ reason: 'raise', amountMinor: 510_000_000, effectiveDate: '2021-01-01' }),
        hire({ reason: 'raise', amountMinor: 530_000_000, effectiveDate: '2022-01-01' }),
      ],
      deps,
    );

    expect(ids).toHaveLength(3);
    expect(employee().currentAmountMinor).toBe(530_000_000);
    expect(
      database.db.select().from(employees).where(eq(employees.id, second)).get()!
        .currentAmountMinor,
    ).toBe(300_000_000);
  });

  it('stores the revision batch id on the history row', () => {
    database.db
      .insert(salaryRevisionBatches)
      .values({
        createdAt: FIXED_NOW,
        effectiveDate: '2021-04-01',
        percentageBp: 700,
        employeeCount: 1,
      })
      .run();
    applySalaryChanges(
      database.db,
      [
        hire({
          reason: 'raise',
          amountMinor: 535_000_000,
          effectiveDate: '2021-04-01',
          batchId: 1,
        }),
      ],
      deps,
    );

    expect(history().at(-1)?.batchId).toBe(1);
  });

  it('stamps rows and the employee with the injected clock', () => {
    expect(history()[0]?.createdAt).toBe(FIXED_NOW);
    expect(employee().updatedAt).toBe(FIXED_NOW);
  });

  it('writes nothing when any change in the call fails', () => {
    expect(() =>
      applySalaryChanges(
        database.db,
        [
          hire({ reason: 'raise', amountMinor: 550_000_000, effectiveDate: '2021-04-01' }),
          hire({ employeeId: 9999, reason: 'raise', amountMinor: 1, effectiveDate: '2021-04-01' }),
        ],
        deps,
      ),
    ).toThrow('Employee 9999 not found');

    expect(history()).toHaveLength(1);
    expect(employee().currentAmountMinor).toBe(500_000_000);
  });

  it('rolls back with an enclosing transaction that later fails', () => {
    expect(() =>
      database.db.transaction((tx) => {
        applySalaryChanges(
          tx,
          [hire({ reason: 'raise', amountMinor: 550_000_000, effectiveDate: '2021-04-01' })],
          deps,
        );
        throw new Error('outer failure');
      }),
    ).toThrow('outer failure');

    expect(history()).toHaveLength(1);
    expect(employee().currentAmountMinor).toBe(500_000_000);
  });
});
