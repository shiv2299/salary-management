import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { employees } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { getPeerContext, getPeerGroups, toPeerContext } from './peer-groups';

let database: ReturnType<typeof createTestDb>;
let emailSequence = 0;

function add(countryCode: string, levelId: number, amountMinor: number) {
  const input: NewEmployeeInput = {
    firstName: 'Asha',
    lastName: 'Rao',
    email: `person${++emailSequence}@acme.test`,
    countryCode,
    departmentId: 1,
    levelId,
    jobTitle: 'Engineer',
    hireDate: '2021-03-01',
    amountMinor,
  };
  return createEmployees(database.db, [input], { now: () => FIXED_NOW })[0]!;
}

let inIdPaidMost: number;
let usId: number;

// Active: IN/L1 x10 at 1,000,000.00 to 1,900,000.00 INR, US/L1 x3. Inactive: one more IN/L1.
beforeEach(() => {
  database = createTestDb();
  emailSequence = 0;
  for (let i = 0; i < 10; i++) inIdPaidMost = add('IN', 1, 100_000_000 + i * 10_000_000);
  const inactive = add('IN', 1, 900_000_000);
  database.db.update(employees).set({ status: 'inactive' }).where(eq(employees.id, inactive)).run();
  for (let i = 0; i < 3; i++) usId = add('US', 1, 10_000_000 + i);
});

describe('getPeerGroups', () => {
  it('groups active employees by country and level and leaves inactive ones out', () => {
    const groups = getPeerGroups(database.db);

    expect(groups.get('IN:1')).toMatchObject({ headcount: 10, currencyCode: 'INR' });
    expect(groups.get('US:1')).toMatchObject({ headcount: 3, summary: null });
    expect(groups.size).toBe(2);
  });

  it('reads only the requested groups when keys are given', () => {
    const groups = getPeerGroups(database.db, [{ countryCode: 'US', levelId: 1 }]);

    expect([...groups.keys()]).toEqual(['US:1']);
  });
});

describe('getPeerContext', () => {
  it('gives an employee the typical range of their peers and where their own pay sits', () => {
    expect(getPeerContext(database.db, inIdPaidMost)).toMatchObject({
      countryCode: 'IN',
      levelCode: 'L1',
      headcount: 10,
      typical: { median: 145_000_000 },
      position: { typical: 'above' },
    });
  });

  it('reports too few peers rather than a range for a small or empty group', () => {
    expect(getPeerContext(database.db, usId)).toMatchObject({
      headcount: 3,
      typical: null,
      position: null,
    });
    expect(
      toPeerContext(
        { countryCode: 'DE', levelId: 3, currencyCode: 'EUR', headcount: 0, summary: null },
        'L3',
        { amountMinor: 1, amountBaseMinor: 1 },
      ),
    ).toMatchObject({ headcount: 0, typical: null, position: null });
  });

  it('answers an unknown employee with not found', () => {
    expect(() => getPeerContext(database.db, 999)).toThrow(
      expect.objectContaining({ statusCode: 404 }),
    );
  });
});
