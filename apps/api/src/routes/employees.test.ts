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
