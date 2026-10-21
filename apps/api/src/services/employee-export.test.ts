import { beforeEach, describe, expect, it } from 'vitest';
import { FIXED_NOW, createTestDb } from '../test/test-db';
import { createEmployee, deactivateEmployee } from './employees';
import { exportEmployeesCsv, type EmployeeExportQuery } from './employee-export';

const deps = { now: () => FIXED_NOW };

let database: ReturnType<typeof createTestDb>;

beforeEach(() => {
  database = createTestDb();
});

let sequence = 0;
function add(
  overrides: {
    firstName?: string;
    jobTitle?: string;
    countryCode?: string;
    amountMinor?: number;
  } = {},
) {
  return createEmployee(
    database.db,
    {
      firstName: overrides.firstName ?? `Emp${++sequence}`,
      lastName: 'Rao',
      email: `emp${++sequence}@acme.test`,
      countryCode: overrides.countryCode ?? 'US',
      departmentId: 1,
      levelId: 1,
      jobTitle: overrides.jobTitle ?? 'Engineer',
      hireDate: '2020-01-01',
      amountMinor: overrides.amountMinor ?? 12_345_678,
    },
    deps,
  );
}

const listQuery = (over: Partial<EmployeeExportQuery> = {}): EmployeeExportQuery => ({
  scope: 'filtered',
  status: 'active',
  sortBy: 'name',
  sortOrder: 'asc',
  ...over,
});

const csv = (query: EmployeeExportQuery, options?: { batchSize: number }) =>
  [...exportEmployeesCsv(database.db, query, options)].join('');

const lines = (text: string) => text.trimEnd().split('\r\n');

describe('exportEmployeesCsv', () => {
  it('starts with a header naming status, local amount, currency, USD amount and effective date', () => {
    add();

    expect(lines(csv(listQuery()))[0]).toBe(
      'id,first_name,last_name,email,country,department,level,job_title,hire_date,status,' +
        'salary,currency,salary_usd,salary_effective_date',
    );
  });

  it('writes amounts as decimal strings from integer minor units', () => {
    add({ countryCode: 'IN', amountMinor: 123_456_789 });

    const row = lines(csv(listQuery()))[1]!.split(',');

    expect(row.slice(9)).toEqual(['active', '1234567.89', 'INR', '14790.12', '2020-01-01']);
  });

  it('exports only the rows matching the filters, across all pages of the list', () => {
    add({ countryCode: 'US' });
    add({ countryCode: 'IN' });
    add({ countryCode: 'US' });

    const rows = lines(csv(listQuery({ country: ['US'] }))).slice(1);

    expect(rows).toHaveLength(2);
  });

  it('leaves inactive employees out of a filtered export unless the status filter includes them', () => {
    add();
    deactivateEmployee(database.db, add(), deps);

    expect(lines(csv(listQuery()))).toHaveLength(2);
    expect(lines(csv(listQuery({ status: 'all' })))).toHaveLength(3);
  });

  it('includes inactive employees with their status when exporting all, ignoring filters', () => {
    add({ countryCode: 'US' });
    deactivateEmployee(database.db, add({ countryCode: 'IN' }), deps);

    const rows = lines(csv({ ...listQuery({ country: ['US'] }), scope: 'all' })).slice(1);

    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.includes(',inactive,'))).toBe(true);
  });

  it('keeps every row when the export spans several batches', () => {
    for (let i = 0; i < 7; i++) add();

    const rows = lines(csv(listQuery(), { batchSize: 3 })).slice(1);

    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.split(',')[0])).size).toBe(7);
  });

  it('quotes fields containing commas, quotes or line breaks', () => {
    add({ jobTitle: 'Lead, "Platform"\nTeam' });

    expect(csv(listQuery())).toContain('"Lead, ""Platform""\nTeam"');
  });

  it('neutralises text that a spreadsheet would run as a formula', () => {
    add({ jobTitle: '=HYPERLINK("http://evil.test")' });

    const text = csv(listQuery());

    expect(text).toContain(`"'=HYPERLINK(""http://evil.test"")"`);
  });

  it('lets other statements run on the connection between chunks', () => {
    const id = add();
    add();
    const chunks = exportEmployeesCsv(database.db, listQuery(), { batchSize: 1 });
    chunks.next();
    chunks.next();

    expect(() => deactivateEmployee(database.db, id, deps)).not.toThrow();
  });
});
