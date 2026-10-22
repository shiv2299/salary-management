import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { departments, employees, salaryHistory, salaryRevisionBatches } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { confirmBulkRevision, previewBulkRevision, summariseBulkRevision } from './bulk-revision';
import { createEmployee, deactivateEmployee } from './employees';

// FIXED_NOW is 2026-01-15, so that is "today" for every rule below.
const deps = { now: () => FIXED_NOW };

let database: ReturnType<typeof createTestDb>;

beforeEach(() => {
  database = createTestDb();
});

let sequence = 0;
function add(
  overrides: {
    countryCode?: string;
    levelId?: number;
    amountMinor?: number;
    departmentId?: number;
  } = {},
) {
  const countryCode = overrides.countryCode ?? 'US';
  return createEmployee(
    database.db,
    {
      firstName: `Emp${++sequence}`,
      lastName: 'Rao',
      email: `emp${sequence}@acme.test`,
      countryCode,
      departmentId: overrides.departmentId ?? 1,
      levelId: overrides.levelId ?? 1,
      jobTitle: 'Engineer',
      hireDate: '2020-01-01',
      amountMinor: overrides.amountMinor ?? 10_000_000,
    },
    deps,
  );
}

const employee = (id: number) =>
  database.db.select().from(employees).where(eq(employees.id, id)).get()!;
const historyOf = (id: number) =>
  database.db.select().from(salaryHistory).where(eq(salaryHistory.employeeId, id)).all();
const batches = () => database.db.select().from(salaryRevisionBatches).all();

describe('previewBulkRevision', () => {
  it('gives each row its current and proposed pay in USD and the change in basis points', () => {
    const india = add({ countryCode: 'IN', amountMinor: 500_000_000 });
    const odd = add({ amountMinor: 333 });
    const items = previewBulkRevision(database.db, {
      employeeIds: [india, odd],
      percentageBp: 700,
    }).items;
    expect(items.find((i) => i.employeeId === india)).toMatchObject({
      currencyCode: 'INR',
      currentAmountMinor: 500_000_000,
      proposedAmountMinor: 535_000_000,
      currentAmountBaseMinor: 5_990_000,
      proposedAmountBaseMinor: 6_409_300,
      changeBp: 700,
    });
    // 333 becomes 356 after rounding, so the change is 6.91%, not the 7% asked for
    expect(items.find((i) => i.employeeId === odd)).toMatchObject({
      proposedAmountMinor: 356,
      changeBp: 691,
    });
  });

  it('flags people already outside their peer range by the same rule as the outliers list', () => {
    const peers = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((m) =>
      add({ amountMinor: m * 1_000_000 }),
    );
    const high = add({ amountMinor: 100_000_000 }); // US/L1 fences are $50,000.00 to $250,000.00
    const items = previewBulkRevision(database.db, {
      filter: { level: [1] },
      percentageBp: 100,
    }).items;
    expect(items.find((i) => i.employeeId === high)?.outsidePeerRange).toBe('above');
    expect(
      items.filter((i) => peers.includes(i.employeeId)).map((i) => i.outsidePeerRange),
    ).toEqual(Array(10).fill(null));
  });

  it('does not flag anyone in a peer group smaller than the minimum size', () => {
    add({ amountMinor: 10_000_000 });
    add({ amountMinor: 11_000_000 });
    add({ amountMinor: 100_000_000 });
    const items = previewBulkRevision(database.db, { filter: {}, percentageBp: 100 }).items;
    expect(items.map((i) => i.outsidePeerRange)).toEqual([null, null, null]);
  });

  it('proposes the percentage increase for every active employee matching the filter', () => {
    const l1 = add({ levelId: 1, amountMinor: 10_000_000 });
    add({ levelId: 2 });

    const preview = previewBulkRevision(database.db, {
      filter: { level: [1] },
      percentageBp: 700,
    });

    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]).toMatchObject({
      employeeId: l1,
      currencyCode: 'USD',
      currentAmountMinor: 10_000_000,
      proposedAmountMinor: 10_700_000,
    });
  });

  it('previews every active employee matching any of the listed countries', () => {
    const india = add({ countryCode: 'IN' });
    const germany = add({ countryCode: 'DE' });
    add({ countryCode: 'US' });

    const preview = previewBulkRevision(database.db, {
      filter: { country: ['IN', 'DE'] },
      percentageBp: 100,
    });

    expect(preview.items.map((i) => i.employeeId).sort()).toEqual([india, germany].sort());
  });

  it('skips inactive employees even when the filter asks for them', () => {
    const active = add();
    const gone = add();
    deactivateEmployee(database.db, gone, deps);

    const preview = previewBulkRevision(database.db, { filter: {}, percentageBp: 100 });

    expect(preview.items.map((i) => i.employeeId)).toEqual([active]);
  });

  it('previews exactly the listed employees when given ids, dropping inactive and unknown ones', () => {
    const a = add();
    add();
    const gone = add();
    deactivateEmployee(database.db, gone, deps);

    const preview = previewBulkRevision(database.db, {
      employeeIds: [a, gone, 9999],
      percentageBp: 100,
    });

    expect(preview.items.map((i) => i.employeeId)).toEqual([a]);
  });

  it('does not write anything', () => {
    const id = add();

    previewBulkRevision(database.db, { filter: {}, percentageBp: 500 });

    expect(historyOf(id)).toHaveLength(1);
    expect(batches()).toHaveLength(0);
  });
});

describe('summariseBulkRevision', () => {
  it('totals the selection with its hand edits per currency and in USD', () => {
    const a = add({ amountMinor: 10_000_000 });
    const b = add({ amountMinor: 20_000_000 });
    const c = add({ countryCode: 'IN', amountMinor: 500_000_000 });
    expect(
      summariseBulkRevision(database.db, {
        employeeIds: [a, b, c],
        percentageBp: 700,
        overrides: [{ employeeId: b, newAmountMinor: 21_000_000 }],
      }),
    ).toEqual({
      headcount: 3,
      byDepartment: [{ departmentName: 'Engineering', headcount: 3 }],
      revision: {
        percentageBp: 700,
        overriddenCount: 1,
        addedByCurrency: [
          { currencyCode: 'INR', addedMinor: 35_000_000 },
          { currencyCode: 'USD', addedMinor: 1_700_000 },
        ],
        addedBaseMinor: 2_119_300,
        typical: { currencyCode: 'USD', beforeMinor: 10_000_000, afterMinor: 10_700_000 },
        overrideChangeBp: [{ employeeId: b, changeBp: 500 }],
      },
    });
  });

  it('gives only the headcount and departments when no percentage is chosen', () => {
    const a = add();
    const b = add();
    expect(summariseBulkRevision(database.db, { employeeIds: [a, b] })).toEqual({
      headcount: 2,
      byDepartment: [{ departmentName: 'Engineering', headcount: 2 }],
      revision: null,
    });
  });

  it('orders the department breakdown by headcount, then by name', () => {
    database.db.insert(departments).values({ name: 'Sales' }).run();
    const ids = [add({ departmentId: 1 }), add({ departmentId: 2 }), add({ departmentId: 2 })];
    expect(summariseBulkRevision(database.db, { employeeIds: ids }).byDepartment).toEqual([
      { departmentName: 'Sales', headcount: 2 },
      { departmentName: 'Engineering', headcount: 1 },
    ]);
  });

  it('ignores edits for people outside the selection and edits equal to the proposed amount', () => {
    const a = add({ amountMinor: 10_000_000 });
    const outside = add({ amountMinor: 10_000_000 });
    const summary = summariseBulkRevision(database.db, {
      employeeIds: [a],
      percentageBp: 700,
      overrides: [
        { employeeId: a, newAmountMinor: 10_700_000 },
        { employeeId: outside, newAmountMinor: 12_000_000 },
      ],
    });
    expect(summary.revision?.overriddenCount).toBe(0);
    expect(summary.revision?.overrideChangeBp).toEqual([]);
    expect(summary.revision?.addedByCurrency).toEqual([
      { currencyCode: 'USD', addedMinor: 700_000 },
    ]);
  });

  it('counts only active people', () => {
    const a = add();
    const gone = add();
    deactivateEmployee(database.db, gone, deps);
    expect(summariseBulkRevision(database.db, { employeeIds: [a, gone] }).headcount).toBe(1);
  });

  it('does not write anything', () => {
    const a = add();
    const before = database.db.select().from(salaryHistory).all().length;
    summariseBulkRevision(database.db, { employeeIds: [a], percentageBp: 500 });
    expect(database.db.select().from(salaryHistory).all().length).toBe(before);
    expect(employee(a).currentAmountMinor).toBe(10_000_000);
  });
});

describe('confirmBulkRevision', () => {
  function request(
    items: { employeeId: number; expected: number; next: number }[],
    overrides: { effectiveDate?: string; percentageBp?: number; note?: string } = {},
  ) {
    return {
      percentageBp: overrides.percentageBp ?? 700,
      effectiveDate: overrides.effectiveDate ?? '2026-01-15',
      note: overrides.note ?? '7% raise',
      items: items.map((i) => ({
        employeeId: i.employeeId,
        expectedCurrentAmountMinor: i.expected,
        newAmountMinor: i.next,
      })),
    };
  }

  it('writes one raise per employee sharing one batch and updates current pay', () => {
    const a = add({ amountMinor: 10_000_000 });
    const b = add({ amountMinor: 20_000_000 });

    const result = confirmBulkRevision(
      database.db,
      request([
        { employeeId: a, expected: 10_000_000, next: 10_700_000 },
        { employeeId: b, expected: 20_000_000, next: 21_400_000 },
      ]),
      deps,
    );

    expect(result).toMatchObject({ employeeCount: 2 });
    expect(batches()).toEqual([
      expect.objectContaining({
        id: result.batchId,
        percentageBp: 700,
        employeeCount: 2,
        note: '7% raise',
        effectiveDate: '2026-01-15',
      }),
    ]);
    for (const id of [a, b]) {
      const row = historyOf(id).at(-1)!;
      expect(row).toMatchObject({ reason: 'raise', batchId: result.batchId });
    }
    expect(employee(a).currentAmountMinor).toBe(10_700_000);
    expect(employee(b).currentAmountMinor).toBe(21_400_000);
  });

  it('applies a hand-overridden amount exactly as entered', () => {
    const a = add({ amountMinor: 10_000_000 });

    confirmBulkRevision(
      database.db,
      request([{ employeeId: a, expected: 10_000_000, next: 12_345_678 }]),
      deps,
    );

    expect(employee(a).currentAmountMinor).toBe(12_345_678);
  });

  it('rejects everything with a conflict when any current amount changed since the preview', () => {
    const a = add({ amountMinor: 10_000_000 });
    const b = add({ amountMinor: 20_000_000 });

    expect(() =>
      confirmBulkRevision(
        database.db,
        request([
          { employeeId: a, expected: 10_000_000, next: 10_700_000 },
          { employeeId: b, expected: 19_000_000, next: 21_400_000 },
        ]),
        deps,
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 409 }));

    expect(historyOf(a)).toHaveLength(1);
    expect(historyOf(b)).toHaveLength(1);
    expect(batches()).toHaveLength(0);
  });

  it('rejects everything with a conflict when any employee has become inactive', () => {
    const a = add({ amountMinor: 10_000_000 });
    const b = add({ amountMinor: 20_000_000 });
    deactivateEmployee(database.db, b, deps);

    expect(() =>
      confirmBulkRevision(
        database.db,
        request([
          { employeeId: a, expected: 10_000_000, next: 10_700_000 },
          { employeeId: b, expected: 20_000_000, next: 21_400_000 },
        ]),
        deps,
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 409 }));

    expect(historyOf(a)).toHaveLength(1);
    expect(batches()).toHaveLength(0);
  });

  it('reports an unknown employee as not found and writes nothing', () => {
    const a = add({ amountMinor: 10_000_000 });

    expect(() =>
      confirmBulkRevision(
        database.db,
        request([
          { employeeId: a, expected: 10_000_000, next: 10_700_000 },
          { employeeId: 9999, expected: 1, next: 2 },
        ]),
        deps,
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 404 }));

    expect(batches()).toHaveLength(0);
  });

  it('rejects a future effective date as an unprocessable request', () => {
    const a = add({ amountMinor: 10_000_000 });

    expect(() =>
      confirmBulkRevision(
        database.db,
        request([{ employeeId: a, expected: 10_000_000, next: 10_700_000 }], {
          effectiveDate: '2026-01-16',
        }),
        deps,
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 422 }));

    expect(batches()).toHaveLength(0);
  });

  it('rejects an override that does not increase pay and writes nothing for anyone', () => {
    const a = add({ amountMinor: 10_000_000 });
    const b = add({ amountMinor: 20_000_000 });

    expect(() =>
      confirmBulkRevision(
        database.db,
        request([
          { employeeId: a, expected: 10_000_000, next: 10_700_000 },
          { employeeId: b, expected: 20_000_000, next: 20_000_000 },
        ]),
        deps,
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 422 }));

    expect(historyOf(a)).toHaveLength(1);
    expect(batches()).toHaveLength(0);
  });

  it('rejects a list that names the same employee twice', () => {
    const a = add({ amountMinor: 10_000_000 });

    expect(() =>
      confirmBulkRevision(
        database.db,
        request([
          { employeeId: a, expected: 10_000_000, next: 10_700_000 },
          { employeeId: a, expected: 10_000_000, next: 10_800_000 },
        ]),
        deps,
      ),
    ).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });
});
