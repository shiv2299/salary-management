import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { departments, employees } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { getDistribution, getOutliers, getPayroll } from './insights';

const deps = { now: () => FIXED_NOW };

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

function deactivate(id: number) {
  database.db.update(employees).set({ status: 'inactive' }).where(eq(employees.id, id)).run();
}

/** Ten US L1 peers paid 10,000.00 to 10,900.00 USD, enough to evaluate the peer group. */
function addTenPeers() {
  return Array.from({ length: 10 }, (_, i) => add({ amountMinor: 1_000_000 + i * 10_000 }));
}

describe('getDistribution', () => {
  it('reports headcount, min, max, mean, median and percentiles per country in USD cents', () => {
    for (const amountMinor of [100_000, 200_000, 300_000, 400_000]) add({ amountMinor });

    const result = getDistribution(database.db, 'country');

    expect(result.baseCurrency).toBe('USD');
    expect(result.groups).toEqual([
      {
        key: 'US',
        label: 'United States',
        distribution: {
          headcount: 4,
          min: 100_000,
          max: 400_000,
          mean: 250_000,
          median: 250_000,
          p25: 175_000,
          p75: 325_000,
          p90: 370_000,
        },
      },
    ]);
  });

  it('converts local salaries to USD before comparing them across countries', () => {
    // 1,000,000.00 INR at 0.01198 USD = 11,980.00 USD
    add({ countryCode: 'IN', amountMinor: 100_000_000 });

    const [group] = getDistribution(database.db, 'country').groups;

    expect(group).toMatchObject({ key: 'IN', distribution: { median: 1_198_000 } });
  });

  it('leaves out inactive employees and groups with no active employees', () => {
    add({ countryCode: 'US' });
    deactivate(add({ countryCode: 'DE', amountMinor: 20_000_000 }));

    const result = getDistribution(database.db, 'country');

    expect(result.groups.map((g) => g.key)).toEqual(['US']);
  });

  it('lists countries by name and levels by rank', () => {
    add({ countryCode: 'US', levelId: 2 });
    add({ countryCode: 'IN', levelId: 1, amountMinor: 100_000_000 });
    add({ countryCode: 'US', levelId: 1 });

    expect(getDistribution(database.db, 'country').groups.map((g) => g.label)).toEqual([
      'India',
      'United States',
    ]);
    expect(getDistribution(database.db, 'level').groups.map((g) => g.label)).toEqual(['L1', 'L2']);
  });

  it('groups by department', () => {
    database.db.insert(departments).values({ name: 'Sales' }).run();
    add({ departmentId: 1 });
    add({ departmentId: 2 });
    add({ departmentId: 2 });

    const groups = getDistribution(database.db, 'department').groups;

    expect(groups.map((g) => [g.label, g.distribution.headcount])).toEqual([
      ['Engineering', 1],
      ['Sales', 2],
    ]);
  });

  it('returns no groups when there are no active employees', () => {
    expect(getDistribution(database.db, 'country').groups).toEqual([]);
  });
});

describe('getPayroll', () => {
  it('sums the current USD salaries of each group and of the whole company', () => {
    add({ countryCode: 'US', amountMinor: 100_000 });
    add({ countryCode: 'US', amountMinor: 250_000 });
    add({ countryCode: 'IN', amountMinor: 100_000_000 });

    const result = getPayroll(database.db, 'country');

    expect(result.baseCurrency).toBe('USD');
    expect(result.groups).toEqual([
      { key: 'IN', label: 'India', headcount: 1, totalBaseMinor: 1_198_000 },
      { key: 'US', label: 'United States', headcount: 2, totalBaseMinor: 350_000 },
    ]);
    expect(result.headcount).toBe(3);
    expect(result.totalBaseMinor).toBe(1_548_000);
  });

  it('groups by department and excludes inactive employees', () => {
    database.db.insert(departments).values({ name: 'Sales' }).run();
    add({ departmentId: 1, amountMinor: 100_000 });
    add({ departmentId: 2, amountMinor: 200_000 });
    deactivate(add({ departmentId: 2, amountMinor: 900_000 }));

    const result = getPayroll(database.db, 'department');

    expect(result.groups.map((g) => [g.label, g.totalBaseMinor])).toEqual([
      ['Engineering', 100_000],
      ['Sales', 200_000],
    ]);
    expect(result.totalBaseMinor).toBe(300_000);
  });
});

describe('getOutliers', () => {
  it('flags an employee paid above the upper fence of their country and level peers', () => {
    addTenPeers();
    const high = add({ firstName: 'Rich', amountMinor: 5_000_000 });

    const result = getOutliers(database.db);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      employeeId: high,
      firstName: 'Rich',
      countryCode: 'US',
      levelCode: 'L1',
      direction: 'above',
      salary: { amountMinor: 5_000_000, currencyCode: 'USD', amountBaseMinor: 5_000_000 },
      peerGroup: { headcount: 11, p25: 1_025_000, median: 1_050_000, p75: 1_075_000 },
    });
    expect(result.items[0]!.peerGroup.lowerFence).toBe(950_000);
    expect(result.items[0]!.peerGroup.upperFence).toBe(1_150_000);
  });

  it('flags an employee paid below the lower fence', () => {
    addTenPeers();
    add({ amountMinor: 100_000 });

    expect(getOutliers(database.db).items.map((i) => i.direction)).toEqual(['below']);
  });

  it('does not flag an employee inside the fences', () => {
    addTenPeers();
    add({ amountMinor: 1_140_000 });

    expect(getOutliers(database.db).items).toEqual([]);
  });

  it('does not evaluate a peer group with fewer than ten active employees', () => {
    for (let i = 0; i < 8; i++) add({ amountMinor: 1_000_000 + i * 10_000 });
    add({ amountMinor: 9_000_000 });

    expect(getOutliers(database.db).items).toEqual([]);
  });

  it('counts only active employees towards the peer group minimum and never flags inactive ones', () => {
    for (let i = 0; i < 9; i++) add({ amountMinor: 1_000_000 + i * 10_000 });
    deactivate(add({ amountMinor: 1_090_000 }));
    deactivate(add({ amountMinor: 9_000_000 }));

    expect(getOutliers(database.db).items).toEqual([]);
  });

  it('compares only within the same country and level', () => {
    addTenPeers();
    // Paid far more than the US L1 peers, but the only INR L1 employee, so there is no peer group.
    add({ countryCode: 'IN', amountMinor: 900_000_000 });
    // The same pay is normal for US L2, which has no peers either.
    add({ levelId: 2, amountMinor: 5_000_000 });

    expect(getOutliers(database.db).items).toEqual([]);
  });

  it('orders outliers by country, then level, then pay descending', () => {
    for (const countryCode of ['US', 'IN']) {
      for (let i = 0; i < 10; i++) {
        add({
          countryCode,
          amountMinor: countryCode === 'IN' ? 100_000_000 + i * 1_000_000 : 1_000_000 + i * 10_000,
        });
      }
    }
    add({ countryCode: 'US', amountMinor: 5_000_000 });
    add({ countryCode: 'US', amountMinor: 6_000_000 });
    add({ countryCode: 'IN', amountMinor: 900_000_000 });

    const items = getOutliers(database.db).items;

    expect(items.map((i) => [i.countryCode, i.salary.amountMinor])).toEqual([
      ['IN', 900_000_000],
      ['US', 6_000_000],
      ['US', 5_000_000],
    ]);
  });
});
