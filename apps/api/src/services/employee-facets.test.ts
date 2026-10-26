import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { employees } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { getEmployeeFacets } from './employee-facets';

const TODAY = '2026-01-15';

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
    const facets = getEmployeeFacets(
      database.db,
      { status: 'active', country: ['IN'], level: [1] },
      TODAY,
    );

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
    expect(
      getEmployeeFacets(database.db, { status: 'active', search: 'channel' }, TODAY).country,
    ).toEqual([{ value: 'IN', count: 1 }]);
  });

  it('reports how many employees have the chosen status before any other filter or search', () => {
    expect(
      getEmployeeFacets(database.db, { status: 'active', country: ['DE'], search: 'x' }, TODAY)
        .statusTotal,
    ).toBe(5);
    expect(getEmployeeFacets(database.db, { status: 'all' }, TODAY).statusTotal).toBe(6);
  });

  it('leaves out options nobody matches', () => {
    expect(
      getEmployeeFacets(database.db, { status: 'active', level: [2] }, TODAY).country.map(
        (c) => c.value,
      ),
    ).toEqual(['IN', 'US']);
  });

  it("counts each attention value under the search and the other groups' selections", () => {
    const facets = getEmployeeFacets(database.db, { status: 'active', country: ['US'] }, TODAY);

    // Everyone was hired years ago and never raised, so the active US person has no raise.
    expect(facets.attention).toEqual([
      { value: 'outlier-above', count: 0 },
      { value: 'outlier-below', count: 0 },
      { value: 'no-raise-2y', count: 1 },
      { value: 'compression', count: 0 },
    ]);
    expect(
      getEmployeeFacets(database.db, { status: 'active', search: 'channel' }, TODAY).attention.find(
        (a) => a.value === 'no-raise-2y',
      )?.count,
    ).toBe(1);
  });

  it("narrows the other groups' counts to the chosen attention values", () => {
    add('DE', 1, { hireDate: '2025-06-01' });

    const facets = getEmployeeFacets(
      database.db,
      { status: 'active', attention: ['no-raise-2y'] },
      TODAY,
    );

    expect(facets.country).toEqual([
      { value: 'DE', count: 1 },
      { value: 'IN', count: 3 },
      { value: 'US', count: 1 },
    ]);
    expect(facets.statusTotal).toBe(6);
    // The attention group ignores its own selection.
    expect(facets.attention.find((a) => a.value === 'no-raise-2y')?.count).toBe(5);
  });

  it('lists all four attention values, zero included', () => {
    const facets = getEmployeeFacets(database.db, { status: 'active' }, TODAY);

    expect(facets.attention.map((a) => a.value)).toEqual([
      'outlier-above',
      'outlier-below',
      'no-raise-2y',
      'compression',
    ]);
    expect(facets.attention.map((a) => a.count)).toEqual([0, 0, 5, 0]);
  });
});
