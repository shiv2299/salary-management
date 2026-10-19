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

  it('rejects an unknown status, an oversized page or a negative offset with a validation error', async () => {
    const t = await setup();

    for (const query of ['status=retired', 'limit=1000', 'limit=0', 'offset=-1', 'sortBy=email']) {
      const response = await get(t, `/api/employees?${query}`);

      expect(response.statusCode, query).toBe(400);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
    }
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
