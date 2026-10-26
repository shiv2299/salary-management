import { attentionResponseSchema } from '@acme/shared';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { employees } from '../db/schema';
import { listLevels } from '../repositories/levels';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { attentionEmployeeIds, getAttention, getAttentionSets } from './attention';
import { createEmployees, type NewEmployeeInput } from './employees';
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
        hireDate: '2025-06-01',
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
  reason: 'raise' | 'promotion' | 'relocation' | 'correction',
  amountMinor: number,
  effectiveDate: string,
  extra: { countryCode?: string; currencyCode?: string } = {},
) {
  applySalaryChanges(
    database.db,
    [{ employeeId, reason, amountMinor, currencyCode: 'USD', effectiveDate, ...extra }],
    deps,
  );
}

function deactivate(id: number) {
  database.db.update(employees).set({ status: 'inactive' }).where(eq(employees.id, id)).run();
}

/** Ten US L1 peers paid 10,000.00 to 10,900.00 USD, enough to evaluate the peer group. */
function addTenPeers() {
  return Array.from({ length: 10 }, (_, i) => add({ amountMinor: 1_000_000 + i * 10_000 }));
}

describe('getAttentionSets', () => {
  it('splits outside-peer-range people into above and below by the FR-8 rule', () => {
    addTenPeers();
    const above = add({ amountMinor: 50_000_000 });
    const below = add({ amountMinor: 10_000 });

    const sets = getAttentionSets(database.db, TODAY);
    const attention = getAttention(database.db, TODAY);

    expect(sets['outlier-above']).toEqual([above]);
    expect(sets['outlier-below']).toEqual([below]);
    expect(attention).toMatchObject({
      activeHeadcount: 12,
      outlierAbove: 1,
      outlierBelow: 1,
      // round_half_away(2 x 10000 / 12)
      outsidePeerRangeShareBp: 1667,
    });
  });

  it('does not evaluate peer groups under the minimum size', () => {
    for (let i = 0; i < 8; i++) add({ amountMinor: 1_000_000 });
    add({ amountMinor: 50_000_000 });

    const sets = getAttentionSets(database.db, TODAY);

    expect(sets['outlier-above']).toEqual([]);
    expect(sets['outlier-below']).toEqual([]);
  });

  it('lists active employees with no raise or promotion in over two years', () => {
    const stale = add({ hireDate: '2020-01-01' });
    const raisedLongAgo = add({ hireDate: '2020-01-01' });
    change(raisedLongAgo, 'raise', 11_000_000, '2023-06-01');
    const raisedRecently = add({ hireDate: '2020-01-01' });
    change(raisedRecently, 'raise', 11_000_000, '2025-06-01');
    const onlyCorrected = add({ hireDate: '2020-01-01' });
    change(onlyCorrected, 'correction', 10_500_000, '2025-06-01');
    const onlyRelocated = add({ hireDate: '2020-01-01' });
    change(onlyRelocated, 'relocation', 900_000_000, '2025-06-01', {
      countryCode: 'IN',
      currencyCode: 'INR',
    });
    const newHire = add({ hireDate: '2025-06-01' });
    const gone = add({ hireDate: '2020-01-01' });
    deactivate(gone);

    const sets = getAttentionSets(database.db, TODAY);

    expect(sets['no-raise-2y']).toEqual([stale, raisedLongAgo, onlyCorrected, onlyRelocated]);
    expect(sets['no-raise-2y']).not.toContain(newHire);
    expect(getAttention(database.db, TODAY).noRaise2y).toBe(4);
  });

  it('lists the long-tenured staff of compressed groups and describes each group', () => {
    const level = listLevels(database.db).find((l) => l.id === 2)!;
    const tenured = Array.from({ length: 5 }, () =>
      add({ levelId: 2, hireDate: '2020-01-01', amountMinor: 10_000_000 }),
    );
    for (let i = 0; i < 5; i++)
      add({ levelId: 2, hireDate: '2025-06-01', amountMinor: 11_000_000 });

    const sets = getAttentionSets(database.db, TODAY);
    const { compression } = getAttention(database.db, TODAY);

    expect(sets.compression).toEqual(tenured);
    expect(compression.peopleCount).toBe(5);
    expect(compression.groups).toEqual([
      {
        countryCode: 'US',
        countryName: 'United States',
        levelId: 2,
        levelCode: level.code,
        recentCount: 5,
        tenuredCount: 5,
        recentMedianBaseMinor: 11_000_000,
        tenuredMedianBaseMinor: 10_000_000,
        gapBp: 1000,
      },
    ]);
  });

  it('gives empty sets and a zero share when nobody is active', () => {
    expect(getAttention(database.db, TODAY)).toMatchObject({
      activeHeadcount: 0,
      outsidePeerRangeShareBp: 0,
      noRaise2y: 0,
    });
  });
});

describe('getAttention', () => {
  it('matches the response schema', () => {
    add();

    expect(() => attentionResponseSchema.parse(getAttention(database.db, TODAY))).not.toThrow();
  });
});

describe('attentionEmployeeIds', () => {
  it('unions the chosen sets', () => {
    const sets = {
      'outlier-above': [5, 9],
      'outlier-below': [1],
      'no-raise-2y': [2, 5, 7],
      compression: [3],
    };

    expect(attentionEmployeeIds(sets, ['outlier-above', 'no-raise-2y'])).toEqual([2, 5, 7, 9]);
  });
});
