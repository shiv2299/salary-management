import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { getEmployeeDetail } from './employee-detail';
import { createEmployees, deactivateEmployee } from './employees';
import { applySalaryChanges } from './salary-writer';

const deps = { now: () => FIXED_NOW };

let database: ReturnType<typeof createTestDb>;

beforeEach(() => {
  database = createTestDb();
});

function addAsha(): number {
  const [id] = createEmployees(
    database.db,
    [
      {
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'asha@acme.test',
        countryCode: 'IN',
        departmentId: 1,
        levelId: 1,
        jobTitle: 'Engineer',
        hireDate: '2021-03-01',
        amountMinor: 500_000_000,
      },
    ],
    deps,
  );
  return id!;
}

describe('getEmployeeDetail', () => {
  it('returns the record with its current salary and the history newest first', () => {
    const id = addAsha();
    applySalaryChanges(
      database.db,
      [
        {
          employeeId: id,
          reason: 'raise',
          amountMinor: 550_000_000,
          currencyCode: 'INR',
          effectiveDate: '2022-04-01',
        },
        {
          employeeId: id,
          reason: 'promotion',
          amountMinor: 700_000_000,
          currencyCode: 'INR',
          effectiveDate: '2023-04-01',
          levelId: 2,
        },
      ],
      deps,
    );

    const detail = getEmployeeDetail(database.db, id, '2026-03-01');

    expect(detail).toMatchObject({
      id,
      firstName: 'Asha',
      levelCode: 'L2',
      salary: { amountMinor: 700_000_000, currencyCode: 'INR' },
    });
    expect(
      detail.history.map((h) => [h.effectiveDate, h.reason, h.levelCode, h.amountMinor]),
    ).toEqual([
      ['2023-04-01', 'promotion', 'L2', 700_000_000],
      ['2022-04-01', 'raise', 'L1', 550_000_000],
      ['2021-03-01', 'hire', 'L1', 500_000_000],
    ]);
    expect(detail.history[0]).toMatchObject({
      countryCode: 'IN',
      currencyCode: 'INR',
      batchId: null,
    });
  });

  it('puts the later row first when two changes share an effective date', () => {
    const id = addAsha();
    applySalaryChanges(
      database.db,
      [
        {
          employeeId: id,
          reason: 'correction',
          amountMinor: 510_000_000,
          currencyCode: 'INR',
          effectiveDate: '2021-03-01',
        },
      ],
      deps,
    );

    const reasons = getEmployeeDetail(database.db, id, '2026-03-01').history.map((h) => h.reason);

    expect(reasons).toEqual(['correction', 'hire']);
  });

  it('throws a 404 for an employee that does not exist', () => {
    expect(() => getEmployeeDetail(database.db, 999, '2026-03-01')).toThrowError(
      expect.objectContaining({ statusCode: 404, code: 'EMPLOYEE_NOT_FOUND' }),
    );
  });

  it('gives each history row its percentage change from the row before it', () => {
    const id = addAsha();
    applySalaryChanges(
      database.db,
      [
        {
          employeeId: id,
          reason: 'raise',
          amountMinor: 525_000_000,
          currencyCode: 'INR',
          effectiveDate: '2022-04-01',
        },
      ],
      deps,
    );

    const detail = getEmployeeDetail(database.db, id, '2026-03-01');

    expect(detail.history.map((h) => h.changeBp)).toEqual([500, null]);
  });

  it('gives each history row its amount in USD and summarises the history up to today', () => {
    const id = addAsha();
    applySalaryChanges(
      database.db,
      [
        {
          employeeId: id,
          reason: 'raise',
          amountMinor: 525_000_000,
          currencyCode: 'INR',
          effectiveDate: '2022-04-01',
        },
      ],
      deps,
    );

    const detail = getEmployeeDetail(database.db, id, '2026-03-01');

    expect(detail.history.map((h) => h.amountBaseMinor)).toEqual([6_289_500, 5_990_000]);
    expect(detail.historySummary).toMatchObject({
      currencyCode: 'INR',
      hireAmountMinor: 500_000_000,
      currentAmountMinor: 525_000_000,
      sinceHireBp: 500,
      averageYearlyGrowthBp: 98,
      raiseCount: 1,
    });
  });

  it("measures an inactive employee's growth up to the day they were deactivated", () => {
    const id = addAsha();
    applySalaryChanges(
      database.db,
      [
        {
          employeeId: id,
          reason: 'raise',
          amountMinor: 525_000_000,
          currencyCode: 'INR',
          effectiveDate: '2022-04-01',
        },
      ],
      deps,
    );
    deactivateEmployee(database.db, id, { now: () => '2024-03-01T09:00:00.000Z' });

    const detail = getEmployeeDetail(database.db, id, '2026-03-01');

    expect(detail.deactivatedOn).toBe('2024-03-01');
    expect(detail.historySummary.averageYearlyGrowthBp).toBe(164);
  });
});
