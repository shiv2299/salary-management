import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { employees } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { getEmployeeFacets } from './employee-facets';

let database: ReturnType<typeof createTestDb>;
let emailSequence = 0;

function add(countryCode: string, levelId: number, overrides: Partial<NewEmployeeInput> = {}) {
  const [id] = createEmployees(
    database.db,
    [
      {
        firstName: 'Asha',
        lastName: 'Rao',
        email: `person${++emailSequence}@acme.test`,
        countryCode,
        departmentId: 1,
        levelId,
        jobTitle: 'Engineer',
        hireDate: '2021-03-01',
        amountMinor: 10_000_000,
        ...overrides,
      },
    ],
    { now: () => FIXED_NOW },
  );
  return id!;
}

// Active: IN/L1 x2, IN/L2, DE/L1, US/L2. Inactive: IN/L1. One IN/L1 is a "Channel Manager".
beforeEach(() => {
  database = createTestDb();
  emailSequence = 0;
  add('IN', 1, { jobTitle: 'Channel Manager' });
  add('IN', 1);
  add('IN', 2);
  add('DE', 1);
  add('US', 2);
  const inactive = add('IN', 1);
  database.db.update(employees).set({ status: 'inactive' }).where(eq(employees.id, inactive)).run();
});

describe('getEmployeeFacets', () => {
  it("counts each option under the other groups' selections but not its own", () => {
    const facets = getEmployeeFacets(database.db, {
      status: 'active',
      country: ['IN'],
      level: [1],
    });

    expect(facets.country).toEqual([
      { value: 'DE', count: 1 },
      { value: 'IN', count: 2 },
    ]);
    expect(facets.level).toEqual([
      { value: 1, count: 2 },
      { value: 2, count: 1 },
    ]);
    expect(facets.status).toEqual([
      { value: 'active', count: 2 },
      { value: 'inactive', count: 1 },
    ]);
    expect(facets.department).toEqual([{ value: 1, count: 2 }]);
  });

  it('applies the search to every group', () => {
    expect(getEmployeeFacets(database.db, { status: 'active', search: 'channel' }).country).toEqual(
      [{ value: 'IN', count: 1 }],
    );
  });

  it('reports how many employees have the chosen status before any other filter or search', () => {
    expect(
      getEmployeeFacets(database.db, { status: 'active', country: ['DE'], search: 'x' })
        .statusTotal,
    ).toBe(5);
    expect(getEmployeeFacets(database.db, { status: 'all' }).statusTotal).toBe(6);
  });

  it('leaves out options nobody matches', () => {
    expect(
      getEmployeeFacets(database.db, { status: 'active', level: [2] }).country.map((c) => c.value),
    ).toEqual(['IN', 'US']);
  });
});
