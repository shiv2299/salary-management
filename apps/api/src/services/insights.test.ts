import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { departments, employees } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { getDistribution } from './insights';

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
