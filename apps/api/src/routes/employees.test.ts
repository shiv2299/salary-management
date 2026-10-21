import { afterEach, describe, expect, it } from 'vitest';
import { FIXED_NOW } from '../test/test-db';
import { createTestApp } from '../test/test-app';
import { createEmployees } from '../services/employees';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let current: TestApp | undefined;

async function setup() {
  current = await createTestApp();
  createEmployees(
    current.database.db,
    ['Ann', 'Bob', 'Cy'].map((firstName, i) => ({
      firstName,
      lastName: 'Rao',
      email: `${firstName.toLowerCase()}@acme.test`,
      countryCode: 'US',
      departmentId: 1,
      levelId: 1,
      jobTitle: 'Engineer',
      hireDate: '2021-03-01',
      amountMinor: 10_000_000 + i,
    })),
    { now: () => FIXED_NOW },
  );
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

describe('GET /api/employees', () => {
  it('returns a page of employees with the total, using defaults for omitted params', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees');

    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: { firstName: string }[]; total: number; limit: number }>();
    expect(body.items.map((e) => e.firstName)).toEqual(['Ann', 'Bob', 'Cy']);
    expect(body).toMatchObject({ total: 3, limit: 50, offset: 0 });
  });

  it('applies search, sort and pagination from the query string', async () => {
    const t = await setup();

    const response = await get(
      t,
      '/api/employees?search=acme&sortBy=salary&sortOrder=desc&limit=2&offset=1',
    );

    const body = response.json<{ items: { firstName: string }[]; total: number }>();
    expect(body.items.map((e) => e.firstName)).toEqual(['Bob', 'Ann']);
    expect(body.total).toBe(3);
  });

  it('accepts repeated and comma-separated filter values and ignores blank ones', async () => {
    const t = await setup();

    for (const query of [
      'country=US&country=IN',
      'country=US,IN',
      'country=&country=US',
      'level=1,2',
    ]) {
      expect((await get(t, `/api/employees?${query}`)).json<{ total: number }>().total).toBe(3);
    }
    expect((await get(t, '/api/employees?country=IN')).json<{ total: number }>().total).toBe(0);
  });

  it('rejects a malformed department or level id with a validation error', async () => {
    const t = await setup();

    for (const query of ['level=abc', 'department=0', 'level=1,x']) {
      expect((await get(t, `/api/employees?${query}`)).statusCode).toBe(400);
    }
  });

  it('rejects an unknown status, an oversized page or a negative offset with a validation error', async () => {
    const t = await setup();

    for (const query of ['status=retired', 'limit=1000', 'limit=0', 'offset=-1', 'sortBy=email']) {
      const response = await get(t, `/api/employees?${query}`);

      expect(response.statusCode, query).toBe(400);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('accepts every sort key', async () => {
    const t = await setup();

    for (const sortBy of [
      'name',
      'jobTitle',
      'department',
      'level',
      'country',
      'hireDate',
      'salary',
    ]) {
      expect((await get(t, `/api/employees?sortBy=${sortBy}`)).statusCode, sortBy).toBe(200);
    }
    expect((await get(t, '/api/employees?sortBy=bogus')).statusCode).toBe(400);
  });

  it('requires a session', async () => {
    const t = await setup();

    const response = await t.app.inject({ method: 'GET', url: '/api/employees' });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/employees/:id', () => {
  it('returns the employee with the salary history', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/2');

    expect(response.statusCode).toBe(200);
    const body = response.json<{ firstName: string; history: { reason: string }[] }>();
    expect(body.firstName).toBe('Bob');
    expect(body.history.map((h) => h.reason)).toEqual(['hire']);
  });

  it('answers an unknown employee with 404 in the standard error shape', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/999');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee 999 not found' },
    });
  });

  it('rejects a non-numeric id with a validation error', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/abc');

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/employees/:id/peer-context', () => {
  it("returns the peer context in the employee's local currency", async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/1/peer-context');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      countryCode: 'US',
      levelId: 1,
      levelCode: 'L1',
      currencyCode: 'USD',
      headcount: 3,
      typical: null,
      position: null,
    });
  });

  it('answers an unknown employee with 404', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/999/peer-context');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'EMPLOYEE_NOT_FOUND' } });
  });
});

const newEmployee = {
  firstName: 'Dina',
  lastName: 'Shah',
  email: 'Dina@Acme.test',
  countryCode: 'DE',
  departmentId: 1,
  levelId: 2,
  jobTitle: 'Designer',
  hireDate: '2024-05-01',
  amountMinor: 7_000_000,
};

async function send(
  t: TestApp,
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return t.app.inject({
    method,
    url,
    headers: { cookie: await t.loginCookie() },
    ...(payload ? { payload } : {}),
  });
}

describe('POST /api/employees', () => {
  it('creates an employee with its hire salary and returns the detail', async () => {
    const t = await setup();

    const response = await send(t, 'POST', '/api/employees', newEmployee);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      firstName: 'Dina',
      email: 'dina@acme.test',
      status: 'active',
      salary: { amountMinor: 7_000_000, currencyCode: 'EUR', amountBaseMinor: 7_560_000 },
      history: [{ reason: 'hire', effectiveDate: '2024-05-01' }],
    });
  });

  it('rejects missing fields, a non-integer amount and a malformed date', async () => {
    const t = await setup();

    for (const bad of [
      { ...newEmployee, firstName: undefined },
      { ...newEmployee, amountMinor: 70.5 },
      { ...newEmployee, amountMinor: 0 },
      { ...newEmployee, hireDate: '01/05/2024' },
      { ...newEmployee, hireDate: '2024-13-45' },
      { ...newEmployee, email: 'not-an-email' },
    ]) {
      const response = await send(t, 'POST', '/api/employees', bad);

      expect(response.statusCode).toBe(400);
    }
  });

  it('answers a duplicate email with 409', async () => {
    const t = await setup();

    const response = await send(t, 'POST', '/api/employees', {
      ...newEmployee,
      email: 'ann@acme.test',
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a form-encoded body', async () => {
    const t = await setup();

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/employees',
      headers: {
        cookie: await t.loginCookie(),
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'firstName=Dina',
    });

    expect(response.statusCode).toBe(415);
  });
});

describe('PATCH /api/employees/:id', () => {
  it('edits name, email, department and job title and returns the detail', async () => {
    const t = await setup();

    const response = await send(t, 'PATCH', '/api/employees/1', {
      jobTitle: 'Principal Engineer',
      email: 'Ann.New@acme.test',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 1,
      jobTitle: 'Principal Engineer',
      email: 'ann.new@acme.test',
    });
  });

  it('rejects country, level and salary fields with 400', async () => {
    const t = await setup();

    for (const field of [
      { countryCode: 'IN' },
      { levelId: 2 },
      { amountMinor: 1 },
      { currentAmountMinor: 1 },
      { status: 'inactive' },
    ]) {
      const response = await send(t, 'PATCH', '/api/employees/1', { jobTitle: 'x', ...field });

      expect(response.statusCode, JSON.stringify(field)).toBe(400);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects an empty change', async () => {
    const t = await setup();

    const response = await send(t, 'PATCH', '/api/employees/1', {});

    expect(response.statusCode).toBe(400);
  });

  it('answers an unknown employee with 404', async () => {
    const t = await setup();

    const response = await send(t, 'PATCH', '/api/employees/999', { jobTitle: 'x' });

    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /api/employees/:id and POST /api/employees/:id/reactivate', () => {
  it('deactivates an employee, who then leaves the default list, and reactivates them', async () => {
    const t = await setup();

    const deactivated = await send(t, 'DELETE', '/api/employees/1');
    const listed = await get(t, '/api/employees');
    const reactivated = await send(t, 'POST', '/api/employees/1/reactivate');

    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json<{ status: string }>().status).toBe('inactive');
    expect(listed.json<{ total: number }>().total).toBe(2);
    expect(reactivated.json<{ status: string }>().status).toBe('active');
  });

  it('keeps the history of a deactivated employee readable', async () => {
    const t = await setup();
    await send(t, 'DELETE', '/api/employees/1');

    const response = await get(t, '/api/employees/1');

    expect(response.json<{ history: unknown[] }>().history).toHaveLength(1);
  });

  it('answers an unknown employee with 404', async () => {
    const t = await setup();

    expect((await send(t, 'DELETE', '/api/employees/999')).statusCode).toBe(404);
    expect((await send(t, 'POST', '/api/employees/999/reactivate')).statusCode).toBe(404);
  });

  it('accepts only JSON on body-less mutations so a cross-site form cannot reactivate', async () => {
    const t = await setup();
    const cookie = await t.loginCookie();

    for (const contentType of ['application/x-www-form-urlencoded', 'text/plain']) {
      const response = await t.app.inject({
        method: 'POST',
        url: '/api/employees/1/reactivate',
        headers: { cookie, 'content-type': contentType },
        payload: 'x=1',
      });

      expect(response.statusCode, contentType).toBe(415);
    }
  });
});

describe('POST /api/employees/:id/salary-changes', () => {
  const raise = { reason: 'raise', effectiveDate: '2025-01-01', amountMinor: 11_000_000 };

  it('records the change and returns the detail with the new current salary and history', async () => {
    const t = await setup();

    const response = await send(t, 'POST', '/api/employees/1/salary-changes', raise);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 1,
      salary: { amountMinor: 11_000_000, effectiveDate: '2025-01-01' },
      history: [{ reason: 'raise' }, { reason: 'hire' }],
    });
  });

  it('records a relocation in the new country currency', async () => {
    const t = await setup();

    const response = await send(t, 'POST', '/api/employees/1/salary-changes', {
      reason: 'relocation',
      effectiveDate: '2025-01-01',
      amountMinor: 9_000_000,
      newCountryCode: 'DE',
    });

    expect(response.json()).toMatchObject({
      countryCode: 'DE',
      salary: { amountMinor: 9_000_000, currencyCode: 'EUR' },
    });
  });

  it('answers a rule violation with 422 and the reasons', async () => {
    const t = await setup();

    const response = await send(t, 'POST', '/api/employees/1/salary-changes', {
      ...raise,
      amountMinor: 5_000_000,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { code: string; message: string } }>().error).toMatchObject({
      code: 'INVALID_SALARY_CHANGE',
      message: expect.stringContaining('raise must increase') as string,
    });
  });

  it('rejects a hire reason, an unknown field and a malformed date with 400', async () => {
    const t = await setup();

    for (const bad of [
      { ...raise, reason: 'hire' },
      { ...raise, reason: 'bonus' },
      { ...raise, currencyCode: 'USD' },
      { ...raise, effectiveDate: 'yesterday' },
      { ...raise, amountMinor: -5 },
    ]) {
      const response = await send(t, 'POST', '/api/employees/1/salary-changes', bad);

      expect(response.statusCode, JSON.stringify(bad)).toBe(400);
    }
  });

  it('answers an unknown employee with 404', async () => {
    const t = await setup();

    const response = await send(t, 'POST', '/api/employees/999/salary-changes', raise);

    expect(response.statusCode).toBe(404);
  });

  it('refuses a change for a deactivated employee', async () => {
    const t = await setup();
    await send(t, 'DELETE', '/api/employees/1');

    const response = await send(t, 'POST', '/api/employees/1/salary-changes', raise);

    expect(response.statusCode).toBe(422);
  });
});

describe('GET /api/employees/facets', () => {
  it('returns the counts for the filters in the query string', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/facets?country=US&level=1');

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      statusTotal: number;
      level: { value: number; count: number }[];
    }>();
    expect(body.statusTotal).toBe(3);
    expect(body.level).toEqual([{ value: 1, count: 3 }]);
  });

  it('is not mistaken for an employee id', async () => {
    const t = await setup();

    const response = await get(t, '/api/employees/facets');

    expect(response.statusCode).toBe(200);
    expect(response.json<{ statusTotal: number }>()).toHaveProperty('statusTotal');
  });

  it('requires a session', async () => {
    const t = await setup();

    const response = await t.app.inject({ method: 'GET', url: '/api/employees/facets' });

    expect(response.statusCode).toBe(401);
  });
});
