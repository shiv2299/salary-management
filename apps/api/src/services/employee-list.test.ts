import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { departments, employees } from '../db/schema';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployees, type NewEmployeeInput } from './employees';
import { listEmployees, type EmployeeListQuery } from './employee-list';

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

function list(query: Partial<EmployeeListQuery> = {}) {
  return listEmployees(database.db, {
    status: 'active',
    sortBy: 'name',
    sortOrder: 'asc',
    limit: 50,
    offset: 0,
    ...query,
  });
}

const names = (result: ReturnType<typeof list>) =>
  result.items.map((e) => `${e.firstName} ${e.lastName}`);

describe('listEmployees search', () => {
  it('matches the term anywhere in the full name, email, or job title, ignoring case', () => {
    add({ firstName: 'Joanne', lastName: 'Smith', email: 'j.smith@acme.test' });
    add({ firstName: 'Bob', lastName: 'Jones', email: 'ann@acme.test' });
    add({
      firstName: 'Carl',
      lastName: 'Young',
      email: 'c.young@acme.test',
      jobTitle: 'Channel Manager',
    });
    add({ firstName: 'Dave', lastName: 'Wilson', email: 'd.wilson@acme.test' });

    const result = list({ search: 'ANN' });

    expect(names(result)).toEqual(['Bob Jones', 'Joanne Smith', 'Carl Young']);
    expect(result.total).toBe(3);
  });

  it('matches across the space between first and last name', () => {
    add({ firstName: 'Asha', lastName: 'Rao' });
    add({ firstName: 'Ashan', lastName: 'Verma' });

    expect(names(list({ search: 'asha rao' }))).toEqual(['Asha Rao']);
  });

  it('treats percent, underscore and backslash in the term literally', () => {
    add({ firstName: 'Fifty', lastName: 'Percent', jobTitle: '50% Owner' });
    add({ firstName: 'Plain', lastName: 'Person', jobTitle: '500 Owner' });
    add({ firstName: 'Under', lastName: 'Score', jobTitle: 'a_b' });
    add({ firstName: 'Other', lastName: 'Person', jobTitle: 'axb' });
    add({ firstName: 'Back', lastName: 'Slash', jobTitle: 'c\\d' });

    expect(names(list({ search: '50%' }))).toEqual(['Fifty Percent']);
    expect(names(list({ search: 'a_b' }))).toEqual(['Under Score']);
    expect(names(list({ search: 'c\\d' }))).toEqual(['Back Slash']);
    expect(names(list({ search: '%' }))).toEqual(['Fifty Percent']);
  });
});

describe('listEmployees status filter', () => {
  it('shows only active employees unless asked otherwise', () => {
    add({ firstName: 'Active', lastName: 'One' });
    deactivate(add({ firstName: 'Gone', lastName: 'Two' }));

    expect(names(list({ status: 'active' }))).toEqual(['Active One']);
    expect(names(list({ status: 'inactive' }))).toEqual(['Gone Two']);
    expect(names(list({ status: 'all' }))).toEqual(['Active One', 'Gone Two']);
  });
});

describe('listEmployees filters', () => {
  it('filters by country, department and level together', () => {
    database.db.insert(departments).values({ name: 'Sales' }).run();
    add({
      firstName: 'Match',
      lastName: 'A',
      countryCode: 'IN',
      departmentId: 2,
      levelId: 3,
      amountMinor: 500_000_000,
    });
    add({
      firstName: 'Wrong',
      lastName: 'Country',
      countryCode: 'US',
      departmentId: 2,
      levelId: 3,
    });
    add({
      firstName: 'Wrong',
      lastName: 'Department',
      countryCode: 'IN',
      departmentId: 1,
      levelId: 3,
      amountMinor: 500_000_000,
    });
    add({
      firstName: 'Wrong',
      lastName: 'Level',
      countryCode: 'IN',
      departmentId: 2,
      levelId: 1,
      amountMinor: 500_000_000,
    });

    const result = list({ country: 'IN', department: 2, level: 3 });

    expect(names(result)).toEqual(['Match A']);
  });
});

describe('listEmployees sorting', () => {
  it('sorts by name by default, last name then first name', () => {
    add({ firstName: 'Zed', lastName: 'Adams' });
    add({ firstName: 'Amy', lastName: 'Brown' });
    add({ firstName: 'Abe', lastName: 'Brown' });

    expect(names(list())).toEqual(['Zed Adams', 'Abe Brown', 'Amy Brown']);
    expect(names(list({ sortOrder: 'desc' }))).toEqual(['Amy Brown', 'Abe Brown', 'Zed Adams']);
  });

  it('sorts salary in USD so $90,000 ranks above ₹50,00,000 (about $59,900)', () => {
    add({ firstName: 'Rupee', lastName: 'Earner', countryCode: 'IN', amountMinor: 500_000_000 });
    add({ firstName: 'Dollar', lastName: 'Earner', countryCode: 'US', amountMinor: 9_000_000 });
    add({ firstName: 'Euro', lastName: 'Earner', countryCode: 'DE', amountMinor: 7_000_000 });

    expect(names(list({ sortBy: 'salary', sortOrder: 'desc' }))).toEqual([
      'Dollar Earner',
      'Euro Earner',
      'Rupee Earner',
    ]);
    expect(names(list({ sortBy: 'salary', sortOrder: 'asc' }))).toEqual([
      'Rupee Earner',
      'Euro Earner',
      'Dollar Earner',
    ]);
  });

  it('sorts by hire date', () => {
    add({ firstName: 'New', lastName: 'Hire', hireDate: '2024-01-01' });
    add({ firstName: 'Old', lastName: 'Hire', hireDate: '2015-01-01' });

    expect(names(list({ sortBy: 'hireDate' }))).toEqual(['Old Hire', 'New Hire']);
  });
});

describe('listEmployees pagination', () => {
  it('returns the requested page and the total matching count', () => {
    for (const lastName of ['A', 'B', 'C', 'D', 'E']) add({ lastName });

    const second = list({ limit: 2, offset: 2 });

    expect(second.items.map((e) => e.lastName)).toEqual(['C', 'D']);
    expect(second).toMatchObject({ total: 5, limit: 2, offset: 2 });
  });

  it('keeps pages stable when sort values tie', () => {
    for (let i = 0; i < 4; i++) add({ firstName: 'Same', lastName: 'Name' });

    const pages = [list({ limit: 2, offset: 0 }), list({ limit: 2, offset: 2 })];

    const ids = pages.flatMap((p) => p.items.map((e) => e.id));
    expect(new Set(ids).size).toBe(4);
  });
});

describe('listEmployees rows', () => {
  it('includes reference names and the current salary', () => {
    add({
      firstName: 'Asha',
      lastName: 'Rao',
      countryCode: 'DE',
      levelId: 2,
      amountMinor: 7_000_000,
    });

    const [row] = list().items;

    expect(row).toMatchObject({
      firstName: 'Asha',
      countryCode: 'DE',
      departmentName: 'Engineering',
      levelCode: 'L2',
      status: 'active',
      salary: {
        amountMinor: 7_000_000,
        currencyCode: 'EUR',
        amountBaseMinor: 7_560_000,
        effectiveDate: '2021-03-01',
      },
    });
  });
});
