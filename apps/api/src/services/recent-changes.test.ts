import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { employees } from '../db/schema';
import { insertSalaryRevisionBatch } from '../repositories/salary-revision-batches';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { getRecentChanges, type RecentChangesQuery } from './recent-changes';
import { applySalaryChanges, type SalaryChange } from './salary-writer';

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
        hireDate: '2015-01-01',
        amountMinor: 10_000_000,
        ...overrides,
      },
    ],
    deps,
  );
  return id!;
}

function change(employeeId: number, overrides: Partial<SalaryChange> = {}): number {
  const [id] = applySalaryChanges(
    database.db,
    [
      {
        employeeId,
        reason: 'raise',
        amountMinor: 11_000_000,
        currencyCode: 'USD',
        effectiveDate: '2025-06-01',
        ...overrides,
      },
    ],
    deps,
  );
  return id!;
}

function recent(query: Partial<RecentChangesQuery> = {}) {
  return getRecentChanges(database.db, {
    today: TODAY,
    range: '3y',
    limit: 50,
    offset: 0,
    ...query,
  });
}

describe('getRecentChanges window', () => {
  it('shows a change dated four years ago in the five-year window but not the three-year one', () => {
    change(add(), { effectiveDate: '2022-01-15' });

    expect(recent({ range: '3y' }).items).toEqual([]);
    expect(recent({ range: '5y' }).items).toHaveLength(1);
  });

  it('includes a change on the first day of the window and excludes the day before', () => {
    change(add(), { effectiveDate: '2023-01-15', amountMinor: 10_100_000 });
    change(add(), { effectiveDate: '2023-01-14', amountMinor: 10_200_000 });

    const items = recent({ range: '3y' }).items;

    expect(items.map((i) => i.effectiveDate)).toEqual(['2023-01-15']);
  });

  it('reports the window it applied', () => {
    expect(recent({ range: '5y' })).toMatchObject({
      range: '5y',
      year: null,
      windowStart: '2021-01-15',
      windowEnd: TODAY,
    });
  });

  it('includes a change dated nine years ago in ten years and every change in all', () => {
    change(add(), { effectiveDate: '2017-03-01' });
    change(add(), { effectiveDate: '2005-03-01', amountMinor: 10_100_000 });

    expect(recent({ range: '5y' }).items).toEqual([]);
    expect(recent({ range: '10y' }).items.map((i) => i.effectiveDate)).toEqual(['2017-03-01']);
    expect(recent({ range: 'all' })).toMatchObject({
      windowStart: null,
      windowEnd: TODAY,
      total: 4,
    });
  });

  it('limits a year to its calendar dates up to today', () => {
    change(add(), { effectiveDate: '2024-12-31' });
    change(add(), { effectiveDate: '2025-01-01', amountMinor: 10_100_000 });

    const past = recent({ year: 2024 });

    expect(past.items.map((i) => i.effectiveDate)).toEqual(['2024-12-31']);
    expect(past).toMatchObject({ year: 2024, windowStart: '2024-01-01', windowEnd: '2024-12-31' });
    expect(recent({ year: 2026 })).toMatchObject({ windowStart: '2026-01-01', windowEnd: TODAY });
  });

  it('lets a year override the range', () => {
    change(add(), { effectiveDate: '2019-05-01' });

    expect(recent({ range: '3y', year: 2019 }).items).toHaveLength(1);
  });

  it('returns no entries for a year without changes or one that has not started', () => {
    change(add(), { effectiveDate: '2025-06-01' });

    expect(recent({ year: 2023 })).toMatchObject({ total: 0, items: [] });
    expect(recent({ year: 2027 })).toMatchObject({ total: 0, items: [] });
  });

  it('dates a change by when it took effect, not when it was entered', () => {
    // Entered today (FIXED_NOW) but effective well before the window.
    change(add(), { effectiveDate: '2019-05-01' });

    expect(recent({ range: '5y' }).items).toEqual([]);
  });
});

describe('getRecentChanges individual entries', () => {
  it('shows who, from and to amounts, the reason and the effective date', () => {
    const id = add({ firstName: 'Ann', lastName: 'Lee' });
    const historyId = change(id, { effectiveDate: '2025-06-01', amountMinor: 11_000_000 });

    expect(recent().items).toEqual([
      {
        kind: 'individual',
        historyId,
        effectiveDate: '2025-06-01',
        reason: 'raise',
        employee: { id, firstName: 'Ann', lastName: 'Lee', countryCode: 'US', status: 'active' },
        from: { amountMinor: 10_000_000, currencyCode: 'USD' },
        to: { amountMinor: 11_000_000, currencyCode: 'USD' },
      },
    ]);
  });

  it('has no from amount for a hire', () => {
    add({ hireDate: '2025-03-01' });

    const [item] = recent().items;

    expect(item).toMatchObject({ kind: 'individual', reason: 'hire', from: null });
  });

  it('compares a change with the row before it by effective date, not by entry order', () => {
    const id = add();
    change(id, { effectiveDate: '2025-09-01', amountMinor: 12_000_000 });
    change(id, { effectiveDate: '2025-03-01', amountMinor: 10_500_000 });

    const items = recent().items;

    expect(
      items.map((i) => i.kind === 'individual' && [i.from?.amountMinor, i.to.amountMinor]),
    ).toEqual([
      [10_500_000, 12_000_000],
      [10_000_000, 10_500_000],
    ]);
  });

  it('shows a relocation from the old currency to the new one under the new country', () => {
    const id = add({ countryCode: 'IN', amountMinor: 100_000_000 });
    change(id, {
      reason: 'relocation',
      effectiveDate: '2025-06-01',
      countryCode: 'DE',
      currencyCode: 'EUR',
      amountMinor: 9_000_000,
    });

    const [item] = recent().items;

    expect(item).toMatchObject({
      reason: 'relocation',
      employee: { countryCode: 'DE' },
      from: { amountMinor: 100_000_000, currencyCode: 'INR' },
      to: { amountMinor: 9_000_000, currencyCode: 'EUR' },
    });
  });

  it('includes changes for deactivated employees and marks them inactive', () => {
    const id = add();
    change(id);
    database.db.update(employees).set({ status: 'inactive' }).where(eq(employees.id, id)).run();

    const [item] = recent().items;

    expect(item).toMatchObject({ employee: { id, status: 'inactive' } });
  });

  it('lists the newest effective date first, with the later entry first on the same day', () => {
    const a = change(add(), { effectiveDate: '2025-02-01' });
    const b = change(add(), { effectiveDate: '2025-08-01' });
    const c = change(add(), { effectiveDate: '2025-08-01' });

    const ids = recent().items.map((i) => i.kind === 'individual' && i.historyId);

    expect(ids).toEqual([c, b, a]);
  });
});

describe('getRecentChanges bulk revisions', () => {
  function bulkRevision(employeeIds: number[], effectiveDate: string, percentageBp: number) {
    const batchId = insertSalaryRevisionBatch(database.db, {
      createdAt: FIXED_NOW,
      effectiveDate,
      percentageBp,
      employeeCount: employeeIds.length,
      note: 'Annual increment',
    });
    applySalaryChanges(
      database.db,
      employeeIds.map((employeeId) => ({
        employeeId,
        reason: 'raise' as const,
        amountMinor: 10_700_000,
        currencyCode: 'USD',
        effectiveDate,
        batchId,
      })),
      deps,
    );
    return batchId;
  }

  it('collapses the rows of one bulk revision into a single entry with headcount and percentage', () => {
    const batchId = bulkRevision([add(), add(), add()], '2025-04-01', 700);

    expect(recent().items).toEqual([
      {
        kind: 'batch',
        batchId,
        effectiveDate: '2025-04-01',
        headcount: 3,
        percentageBp: 700,
        note: 'Annual increment',
      },
    ]);
  });

  it('counts a bulk revision as one entry when paginating, among individual changes', () => {
    const ids = [add(), add(), add()];
    change(add(), { effectiveDate: '2025-01-10' });
    bulkRevision(ids, '2025-04-01', 700);
    change(add(), { effectiveDate: '2025-09-01' });

    const first = recent({ limit: 2, offset: 0 });
    const second = recent({ limit: 2, offset: 2 });

    expect(first.total).toBe(3);
    expect(first.items.map((i) => i.kind)).toEqual(['individual', 'batch']);
    expect(second.items.map((i) => i.kind)).toEqual(['individual']);
    expect(second).toMatchObject({ limit: 2, offset: 2 });
  });

  it('keeps inactive employees in the headcount of the revision they received', () => {
    const ids = [add(), add()];
    bulkRevision(ids, '2025-04-01', 500);
    database.db
      .update(employees)
      .set({ status: 'inactive' })
      .where(eq(employees.id, ids[0]!))
      .run();

    expect(recent().items[0]).toMatchObject({ kind: 'batch', headcount: 2 });
  });
});

describe('getRecentChanges reasons and years', () => {
  it('filters by reason and keeps a bulk revision as one entry', () => {
    const ids = [add(), add(), add()];
    const batchId = insertSalaryRevisionBatch(database.db, {
      createdAt: FIXED_NOW,
      effectiveDate: '2025-04-01',
      percentageBp: 700,
      employeeCount: 3,
      note: null,
    });
    applySalaryChanges(
      database.db,
      ids.map((employeeId) => ({
        employeeId,
        reason: 'raise' as const,
        amountMinor: 10_700_000,
        currencyCode: 'USD',
        effectiveDate: '2025-04-01',
        batchId,
      })),
      deps,
    );
    change(add(), { reason: 'promotion', effectiveDate: '2025-05-01', levelId: 2 });

    const result = recent({ reason: ['raise'] });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ kind: 'batch', batchId, headcount: 3 });
  });

  it('lists the years that have changes, newest first', () => {
    change(add(), { effectiveDate: '2025-06-01' });
    change(add(), { effectiveDate: '2019-06-01' });
    change(add(), { effectiveDate: '2019-07-01' });

    expect(recent().availableYears).toEqual([2025, 2019, 2015]);
  });
});
