import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { employees, salaryHistory } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployee, deactivateEmployee } from './employees';
import { recordSalaryChange } from './salary-changes';

// FIXED_NOW is 2026-01-15, so that is "today" for every rule below.
const deps = { now: () => FIXED_NOW };

let database: ReturnType<typeof createTestDb>;

beforeEach(() => {
  database = createTestDb();
});

function addAsha(
  overrides: { countryCode?: string; amountMinor?: number; hireDate?: string } = {},
) {
  return createEmployee(
    database.db,
    {
      firstName: 'Asha',
      lastName: 'Rao',
      email: 'asha@acme.test',
      countryCode: 'IN',
      departmentId: 1,
      levelId: 1,
      jobTitle: 'Engineer',
      hireDate: '2020-01-01',
      amountMinor: 500_000_000,
      ...overrides,
    },
    deps,
  );
}

const employee = (id: number) =>
  database.db.select().from(employees).where(eq(employees.id, id)).get()!;
const historyOf = (id: number) =>
  database.db.select().from(salaryHistory).where(eq(salaryHistory.employeeId, id)).all();

function rejection(run: () => void) {
  try {
    run();
  } catch (error) {
    return error as Error & { statusCode?: number; code?: string };
  }
  return undefined;
}

describe('recordSalaryChange: raise', () => {
  it('appends a history row and makes it the current salary', () => {
    const id = addAsha();

    recordSalaryChange(
      database.db,
      id,
      { reason: 'raise', effectiveDate: '2025-04-01', amountMinor: 600_000_000 },
      deps,
    );

    expect(employee(id)).toMatchObject({
      currentAmountMinor: 600_000_000,
      currentCurrencyCode: 'INR',
      currentAmountBaseMinor: 7_188_000,
      currentEffectiveDate: '2025-04-01',
      currentReason: 'raise',
      levelId: 1,
      countryCode: 'IN',
    });
    expect(historyOf(id)).toHaveLength(2);
  });

  it('rejects a raise that does not increase the amount, writing nothing', () => {
    const id = addAsha();

    const error = rejection(() =>
      recordSalaryChange(
        database.db,
        id,
        { reason: 'raise', effectiveDate: '2025-04-01', amountMinor: 500_000_000 },
        deps,
      ),
    );

    expect(error).toMatchObject({ statusCode: 422, code: 'INVALID_SALARY_CHANGE' });
    expect(error?.message).toContain('raise must increase');
    expect(historyOf(id)).toHaveLength(1);
  });
});

describe('recordSalaryChange: dates and status', () => {
  const raise = { reason: 'raise' as const, amountMinor: 600_000_000 };

  it('rejects a future effective date and accepts today', () => {
    const id = addAsha();

    const future = rejection(() =>
      recordSalaryChange(database.db, id, { ...raise, effectiveDate: '2026-01-16' }, deps),
    );
    const today = rejection(() =>
      recordSalaryChange(database.db, id, { ...raise, effectiveDate: '2026-01-15' }, deps),
    );

    expect(future?.message).toContain('future');
    expect(today).toBeUndefined();
  });

  it('rejects a date before the hire date', () => {
    const id = addAsha({ hireDate: '2022-06-01' });

    const error = rejection(() =>
      recordSalaryChange(database.db, id, { ...raise, effectiveDate: '2022-05-31' }, deps),
    );

    expect(error?.message).toContain('hire date');
  });

  it('rejects a change for an inactive employee', () => {
    const id = addAsha();
    deactivateEmployee(database.db, id, deps);

    const error = rejection(() =>
      recordSalaryChange(database.db, id, { ...raise, effectiveDate: '2025-04-01' }, deps),
    );

    expect(error).toMatchObject({ statusCode: 422 });
    expect(error?.message).toContain('active');
  });

  it('throws a 404 for an unknown employee', () => {
    const error = rejection(() =>
      recordSalaryChange(database.db, 999, { ...raise, effectiveDate: '2025-04-01' }, deps),
    );

    expect(error).toMatchObject({ statusCode: 404, code: 'EMPLOYEE_NOT_FOUND' });
  });

  it('rejects a hire row', () => {
    const id = addAsha();

    const error = rejection(() =>
      recordSalaryChange(
        database.db,
        id,
        { reason: 'hire', effectiveDate: '2025-04-01', amountMinor: 1 },
        deps,
      ),
    );

    expect(error?.message).toContain('hire rows');
  });
});

describe('recordSalaryChange: promotion', () => {
  it('moves the employee to the higher level together with the new salary', () => {
    const id = addAsha();

    recordSalaryChange(
      database.db,
      id,
      { reason: 'promotion', effectiveDate: '2025-04-01', amountMinor: 700_000_000, newLevelId: 3 },
      deps,
    );

    expect(employee(id)).toMatchObject({ levelId: 3, currentReason: 'promotion' });
    expect(historyOf(id).find((h) => h.reason === 'promotion')).toMatchObject({ levelId: 3 });
  });

  it('rejects a promotion to the same or a lower level', () => {
    const id = addAsha();

    const error = rejection(() =>
      recordSalaryChange(
        database.db,
        id,
        {
          reason: 'promotion',
          effectiveDate: '2025-04-01',
          amountMinor: 700_000_000,
          newLevelId: 1,
        },
        deps,
      ),
    );

    expect(error?.message).toContain('higher level');
    expect(employee(id).levelId).toBe(1);
  });

  it('rejects an unknown level', () => {
    const id = addAsha();

    const error = rejection(() =>
      recordSalaryChange(
        database.db,
        id,
        {
          reason: 'promotion',
          effectiveDate: '2025-04-01',
          amountMinor: 700_000_000,
          newLevelId: 99,
        },
        deps,
      ),
    );

    expect(error?.message).toContain('unknown level');
  });
});

describe('recordSalaryChange: relocation', () => {
  it('stores the new salary in the new currency and updates the country in the same change', () => {
    const id = addAsha();

    recordSalaryChange(
      database.db,
      id,
      {
        reason: 'relocation',
        effectiveDate: '2025-04-01',
        amountMinor: 7_000_000,
        newCountryCode: 'DE',
      },
      deps,
    );

    expect(employee(id)).toMatchObject({
      countryCode: 'DE',
      currentAmountMinor: 7_000_000,
      currentCurrencyCode: 'EUR',
      currentAmountBaseMinor: 7_560_000,
      currentReason: 'relocation',
    });
    expect(historyOf(id).find((h) => h.reason === 'relocation')).toMatchObject({
      currencyCode: 'EUR',
      countryCode: 'DE',
    });
  });

  it('rejects a relocation to the current country or to an unknown country', () => {
    const id = addAsha();

    const same = rejection(() =>
      recordSalaryChange(
        database.db,
        id,
        { reason: 'relocation', effectiveDate: '2025-04-01', amountMinor: 1, newCountryCode: 'IN' },
        deps,
      ),
    );
    const unknown = rejection(() =>
      recordSalaryChange(
        database.db,
        id,
        { reason: 'relocation', effectiveDate: '2025-04-01', amountMinor: 1, newCountryCode: 'FR' },
        deps,
      ),
    );

    expect(same?.message).toContain('different country');
    expect(unknown?.message).toContain('unknown country');
  });
});

describe('recordSalaryChange: correction and backdating', () => {
  it('lets a correction dated the same day as the row it fixes become the current salary', () => {
    const id = addAsha();

    recordSalaryChange(
      database.db,
      id,
      { reason: 'correction', effectiveDate: '2020-01-01', amountMinor: 450_000_000 },
      deps,
    );

    expect(employee(id)).toMatchObject({
      currentAmountMinor: 450_000_000,
      currentReason: 'correction',
    });
    expect(historyOf(id)).toHaveLength(2);
  });

  it('records a backdated change in history without changing current pay', () => {
    const id = addAsha();
    recordSalaryChange(
      database.db,
      id,
      { reason: 'raise', effectiveDate: '2025-04-01', amountMinor: 600_000_000 },
      deps,
    );

    recordSalaryChange(
      database.db,
      id,
      { reason: 'correction', effectiveDate: '2021-01-01', amountMinor: 520_000_000 },
      deps,
    );

    expect(employee(id)).toMatchObject({ currentAmountMinor: 600_000_000, currentReason: 'raise' });
    expect(historyOf(id)).toHaveLength(3);
  });

  it('records a backdated change in the currency of the country in force on that date', () => {
    const id = addAsha();
    recordSalaryChange(
      database.db,
      id,
      {
        reason: 'relocation',
        effectiveDate: '2024-01-01',
        amountMinor: 7_000_000,
        newCountryCode: 'DE',
      },
      deps,
    );

    recordSalaryChange(
      database.db,
      id,
      { reason: 'correction', effectiveDate: '2022-01-01', amountMinor: 480_000_000 },
      deps,
    );

    const backdated = historyOf(id).find((h) => h.effectiveDate === '2022-01-01');
    expect(backdated).toMatchObject({ currencyCode: 'INR', countryCode: 'IN' });
    expect(employee(id)).toMatchObject({ countryCode: 'DE', currentCurrencyCode: 'EUR' });
  });

  it('lets a correction fix the level', () => {
    const id = addAsha();

    recordSalaryChange(
      database.db,
      id,
      {
        reason: 'correction',
        effectiveDate: '2020-01-01',
        amountMinor: 500_000_000,
        newLevelId: 2,
      },
      deps,
    );

    expect(employee(id).levelId).toBe(2);
  });

  it('reports every violation at once', () => {
    const id = addAsha();

    const error = rejection(() =>
      recordSalaryChange(
        database.db,
        id,
        { reason: 'raise', effectiveDate: '2026-02-01', amountMinor: 1 },
        deps,
      ),
    );

    expect(error?.message).toContain('future');
    expect(error?.message).toContain('raise must increase');
  });
});
