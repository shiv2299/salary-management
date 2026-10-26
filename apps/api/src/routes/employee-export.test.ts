import { afterEach, describe, expect, it } from 'vitest';
import { createEmployees, deactivateEmployee } from '../services/employees';
import { FIXED_NOW } from '../test/test-db';
import { createTestApp } from '../test/test-app';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let current: TestApp | undefined;

async function setup() {
  current = await createTestApp({ now: () => new Date(FIXED_NOW) });
  const [, , gone] = createEmployees(
    current.database.db,
    ['Ann', 'Bob', 'Cy'].map((firstName, i) => ({
      firstName,
      lastName: 'Rao',
      email: `${firstName.toLowerCase()}@acme.test`,
      countryCode: i === 1 ? 'IN' : 'US',
      departmentId: 1,
      levelId: 1,
      jobTitle: 'Engineer',
      hireDate: '2021-03-01',
      amountMinor: 10_000_000,
    })),
    { now: () => FIXED_NOW },
  );
  deactivateEmployee(current.database.db, gone!, { now: () => FIXED_NOW });
  return current;
}

afterEach(async () => {
  await current?.app.close();
  current?.database.close();
  current = undefined;
});

async function get(t: TestApp, url: string) {
  return t.app.inject({ method: 'GET', url, headers: { cookie: await t.loginCookie() } });
}

describe('GET /api/employees/export', () => {
  it('streams a CSV attachment of the filtered rows', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/export?scope=filtered&country=US');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="employees-filtered-2026-01-15.csv"',
    );
    expect(response.body.trimEnd().split('\r\n')).toHaveLength(2);
    expect(response.body).toContain('Ann');
  });

  it('exports only the people an attention filter names', async () => {
    const t = await setup();

    const none = await get(t, '/api/employees/export?scope=filtered&attention=outlier-above');
    const stale = await get(t, '/api/employees/export?scope=filtered&attention=no-raise-2y');

    expect(none.body.trimEnd().split('\r\n')).toHaveLength(1);
    expect(stale.body.trimEnd().split('\r\n')).toHaveLength(3);
  });

  it('exports the rows matching several values of one filter', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/export?scope=filtered&country=US&country=IN');

    const rows = response.body.trimEnd().split('\r\n');
    expect(rows).toHaveLength(3);
    expect(response.body).toContain('Ann');
    expect(response.body).toContain('Bob');
  });

  it('includes inactive employees with a status column when scope is all', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/export?scope=all');

    const rows = response.body.trimEnd().split('\r\n');
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.includes(',inactive,'))).toHaveLength(1);
  });

  it('is not mistaken for an employee id', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/export?scope=all');

    expect(response.statusCode).toBe(200);
  });

  it('rejects a missing or unknown scope with 400', async () => {
    const t = await setup();

    expect((await get(t, '/api/employees/export')).statusCode).toBe(400);
    expect((await get(t, '/api/employees/export?scope=some')).statusCode).toBe(400);
  });

  it('requires a session', async () => {
    const t = await setup();

    const response = await t.app.inject({ method: 'GET', url: '/api/employees/export?scope=all' });

    expect(response.statusCode).toBe(401);
  });
});
