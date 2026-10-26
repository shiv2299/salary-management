import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { departments, employees } from '../db/schema';
import { convert } from '../domain/fx';
import { percentChangeBpOrNull } from '../domain/revision';
import { listActiveEmployeeRows } from '../repositories/employees';
import { loadLatestFxRates } from '../repositories/fx-rates';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { getPayrollChange, getPayrollTrend, getRaiseStats } from './insights-history';
import { applySalaryChanges } from './salary-writer';

const deps = { now: () => FIXED_NOW };
const TODAY = '2026-01-15';

let database: ReturnType<typeof createTestDb>;
let emailSequence = 0;

beforeEach(() => {
  database = createTestDb();
  emailSequence = 0;
});

function add(overrides: Partial<NewEmployeeInput> = {}): number {
  const [id] = createEmployees(
    database.db,
    [
      {
        firstName: 'Asha',
        lastName: 'Rao',
        email: `person${++emailSequence}@acme.test`,
        countryCode: 'US',
        departmentId: 1,
        levelId: 1,
        jobTitle: 'Engineer',
        hireDate: '2021-03-01',
        amountMinor: 10_000_000,
        ...overrides,
      },
    ],
    deps,
  );
  return id!;
}

function change(
  employeeId: number,
  reason: 'raise' | 'promotion' | 'correction',
  amountMinor: number,
  effectiveDate: string,
  currencyCode = 'USD',
) {
  applySalaryChanges(
    database.db,
    [{ employeeId, reason, amountMinor, currencyCode, effectiveDate }],
    deps,
  );
}

function deactivate(id: number, deactivatedOn: string) {
  database.db
    .update(employees)
    .set({ status: 'inactive', deactivatedOn })
    .where(eq(employees.id, id))
    .run();
}

describe('getPayrollTrend', () => {
  it('plots a point at each year end from the earliest hire year, then today', () => {
    add({ hireDate: '2023-05-01' });

    const { points } = getPayrollTrend(database.db, TODAY);

    expect(points.map((p) => p.date)).toEqual([
      '2023-12-31',
      '2024-12-31',
      '2025-12-31',
      '2026-01-15',
    ]);
    expect(points.map((p) => p.isToday)).toEqual([false, false, false, true]);
    expect(points.at(-1)?.year).toBe(2026);
  });

  it('plots only today with no employees', () => {
    const { points, summary } = getPayrollTrend(database.db, TODAY);

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ date: TODAY, headcount: 0, totalBaseMinor: 0 });
    expect(summary.changeBp).toBeNull();
  });

  it('counts a leaver until their deactivation date', () => {
    const leftOnNewYear = add({ hireDate: '2020-01-01' });
    const leftBeforeNewYear = add({ hireDate: '2020-01-01' });
    deactivate(leftOnNewYear, '2025-01-01');
    deactivate(leftBeforeNewYear, '2024-12-31');

    const { points } = getPayrollTrend(database.db, TODAY);

    expect(points.find((p) => p.year === 2023)?.headcount).toBe(2);
    expect(points.find((p) => p.year === 2024)?.headcount).toBe(1);
    expect(points.find((p) => p.year === 2025)?.headcount).toBe(0);
  });

  it("makes today's point the sum of active employees' current USD pay, by country and department", () => {
    database.db.insert(departments).values({ name: 'Design' }).run();
    add({ countryCode: 'IN', amountMinor: 500_000_000 });
    add({ countryCode: 'US', amountMinor: 10_000_000 });
    add({ countryCode: 'US', departmentId: 2, amountMinor: 20_000_000 });

    const today = getPayrollTrend(database.db, TODAY).points.at(-1)!;

    const active = listActiveEmployeeRows(database.db);
    const total = active.reduce((sum, row) => sum + row.currentAmountBaseMinor, 0);
    expect(today.totalBaseMinor).toBe(total);
    expect(today.headcount).toBe(3);
    expect(today.byCountry.map((g) => g.key)).toEqual(['DE', 'IN', 'US']);
    expect(today.byCountry.map((g) => g.label)).toEqual(['Germany', 'India', 'United States']);
    expect(today.byCountry.find((g) => g.key === 'DE')).toMatchObject({
      headcount: 0,
      totalBaseMinor: 0,
    });
    const us = active
      .filter((row) => row.countryCode === 'US')
      .reduce((sum, row) => sum + row.currentAmountBaseMinor, 0);
    expect(today.byCountry.find((g) => g.key === 'US')?.totalBaseMinor).toBe(us);
    expect(today.byDepartment.map((g) => [g.key, g.label, g.headcount])).toEqual([
      ['2', 'Design', 1],
      ['1', 'Engineering', 2],
    ]);
  });

  it("converts past pay at today's rates", () => {
    add({ countryCode: 'IN', amountMinor: 500_000_000, hireDate: '2023-02-01' });

    const point = getPayrollTrend(database.db, TODAY).points.find((p) => p.year === 2024)!;

    expect(point.totalBaseMinor).toBe(
      convert(500_000_000, 'INR', 'USD', loadLatestFxRates(database.db)),
    );
  });

  it('summarises the year against a year ago', () => {
    const id = add({ hireDate: '2020-01-01', amountMinor: 10_000_000 });
    change(id, 'raise', 11_000_000, '2025-06-01');

    const { summary } = getPayrollTrend(database.db, TODAY);

    expect(summary).toEqual({
      totalBaseMinor: 11_000_000,
      yearAgoTotalBaseMinor: 10_000_000,
      changeBp: percentChangeBpOrNull(10_000_000, 11_000_000),
      headcount: 1,
      yearAgoHeadcount: 1,
    });
  });

  it('has no change percentage when there was no payroll a year ago', () => {
    add({ hireDate: '2025-09-01' });

    const { summary } = getPayrollTrend(database.db, TODAY);

    expect(summary.yearAgoTotalBaseMinor).toBe(0);
    expect(summary.changeBp).toBeNull();
  });
});

describe('getPayrollChange', () => {
  it('breaks the last 12 months of payroll change into causes that add up', () => {
    const raised = add({ hireDate: '2020-01-01', amountMinor: 10_000_000 });
    change(raised, 'raise', 12_000_000, '2025-06-01');
    const leaver = add({ hireDate: '2020-01-01', amountMinor: 5_000_000 });
    deactivate(leaver, '2025-09-01');
    add({ hireDate: '2025-10-01', amountMinor: 7_000_000 });

    const result = getPayrollChange(database.db, TODAY);

    expect(result.from).toBe('2025-01-15');
    expect(result.to).toBe(TODAY);
    expect(result.changeBaseMinor).toBe(result.toTotalBaseMinor - result.fromTotalBaseMinor);
    expect(result.causes.reduce((sum, c) => sum + c.amountBaseMinor, 0)).toBe(
      result.changeBaseMinor,
    );
    expect(result.causes.map((c) => c.cause)).toEqual([
      'hires',
      'raises',
      'promotions',
      'relocations',
      'corrections',
      'leavers',
    ]);
    expect(result.causes.find((c) => c.cause === 'hires')).toMatchObject({
      amountBaseMinor: 7_000_000,
      count: 1,
    });
    expect(result.causes.find((c) => c.cause === 'leavers')).toMatchObject({
      amountBaseMinor: -5_000_000,
      count: 1,
    });
    expect(result.largestAddition).toBe('hires');
  });

  it('has no largest addition when no cause is positive', () => {
    const id = add({ hireDate: '2020-01-01', amountMinor: 10_000_000 });
    deactivate(id, '2025-09-01');

    const result = getPayrollChange(database.db, TODAY);

    expect(result.changeBaseMinor).toBe(-10_000_000);
    expect(result.largestAddition).toBeNull();
  });
});

describe('getRaiseStats', () => {
  it('reports raises per calendar year from the first increase to this year', () => {
    const id = add({ hireDate: '2020-01-01', amountMinor: 10_000_000 });
    change(id, 'raise', 11_000_000, '2023-04-01');

    const { years } = getRaiseStats(database.db, TODAY);

    expect(years.map((y) => y.year)).toEqual([2023, 2024, 2025, 2026]);
    expect(years.map((y) => y.yearToDate)).toEqual([false, false, false, true]);
    expect(years[0]!.all).toMatchObject({
      raiseCount: 1,
      averageRaiseBp: 1000,
      raisesAddedBaseMinor: 1_000_000,
      totalAddedBaseMinor: 1_000_000,
    });
    expect(years[1]!.all).toMatchObject({
      raiseCount: 0,
      averageRaiseBp: null,
      totalAddedBaseMinor: 0,
    });
    for (const year of years) {
      expect(year.byCountry.map((g) => g.key)).toEqual(['DE', 'IN', 'US']);
      expect(year.byDepartment.map((g) => g.key)).toEqual(['1']);
    }
    expect(years[0]!.byCountry.find((g) => g.key === 'US')?.raiseCount).toBe(1);
    expect(years[0]!.byDepartment[0]?.raiseCount).toBe(1);
  });

  it('counts promotions apart from raises', () => {
    const id = add({ hireDate: '2020-01-01', amountMinor: 10_000_000 });
    change(id, 'promotion', 13_000_000, '2025-03-01');

    const year = getRaiseStats(database.db, TODAY).years.find((y) => y.year === 2025)!;

    expect(year.all).toMatchObject({
      raiseCount: 0,
      promotionCount: 1,
      promotionsAddedBaseMinor: 3_000_000,
    });
  });

  it('reports only this year when there are no increases', () => {
    add();

    expect(getRaiseStats(database.db, TODAY).years.map((y) => y.year)).toEqual([2026]);
  });

  it('compares the last 12 months of raises with the 12 before', () => {
    const id = add({ hireDate: '2020-01-01', amountMinor: 10_000_000 });
    change(id, 'raise', 11_000_000, '2024-06-01');
    change(id, 'raise', 12_100_000, '2025-06-01');

    const { trailing } = getRaiseStats(database.db, TODAY);

    expect(trailing.current).toMatchObject({
      after: '2025-01-15',
      through: TODAY,
      raiseCount: 1,
      raisesAddedBaseMinor: 1_100_000,
    });
    expect(trailing.previous).toMatchObject({
      after: '2024-01-15',
      through: '2025-01-15',
      raiseCount: 1,
      raisesAddedBaseMinor: 1_000_000,
    });
  });

  it('includes raises given to people who have since left', () => {
    const id = add({ hireDate: '2020-01-01', amountMinor: 10_000_000 });
    change(id, 'raise', 11_000_000, '2025-06-01');
    deactivate(id, '2025-12-01');

    expect(getRaiseStats(database.db, TODAY).trailing.current.raiseCount).toBe(1);
  });
});
