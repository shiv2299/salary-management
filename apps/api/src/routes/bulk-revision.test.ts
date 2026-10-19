import { afterEach, describe, expect, it } from 'vitest';
import { createEmployees } from '../services/employees';
import { FIXED_NOW } from '../test/test-db';
import { createTestApp } from '../test/test-app';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let current: TestApp | undefined;

// The test app's clock is FIXED_NOW, so "today" is 2026-01-15.
async function setup() {
  current = await createTestApp({ now: () => new Date(FIXED_NOW) });
  createEmployees(
    current.database.db,
    ['Ann', 'Bob'].map((firstName, i) => ({
      firstName,
      lastName: 'Rao',
      email: `${firstName.toLowerCase()}@acme.test`,
      countryCode: 'US',
      departmentId: 1,
      levelId: 1,
      jobTitle: 'Engineer',
      hireDate: '2021-03-01',
      amountMinor: 10_000_000 * (i + 1),
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

async function post(t: TestApp, url: string, payload: unknown) {
  return t.app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: { cookie: await t.loginCookie() },
  });
}

describe('POST /api/employees/bulk-salary-changes/preview', () => {
  it('returns every matching active employee with the proposed amount', async () => {
    const t = await setup();

    const response = await post(t, '/api/employees/bulk-salary-changes/preview', {
      filter: { country: 'US' },
      percentageBp: 1000,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ items: { proposedAmountMinor: number }[]; total: number }>();
    expect(body.total).toBe(2);
    expect(body.items.map((i) => i.proposedAmountMinor)).toEqual([11_000_000, 22_000_000]);
  });

  it('rejects a percentage outside 1 to 10000 basis points with 400', async () => {
    const t = await setup();

    const response = await post(t, '/api/employees/bulk-salary-changes/preview', {
      filter: {},
      percentageBp: 10_001,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a body that gives both a filter and ids with 400', async () => {
    const t = await setup();

    const response = await post(t, '/api/employees/bulk-salary-changes/preview', {
      filter: {},
      employeeIds: [1],
      percentageBp: 100,
    });

    expect(response.statusCode).toBe(400);
  });

  it('requires a session', async () => {
    const t = await setup();

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/employees/bulk-salary-changes/preview',
      payload: { filter: {}, percentageBp: 100 },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/employees/bulk-salary-changes', () => {
  const confirm = (items: object[], extra: object = {}) => ({
    percentageBp: 1000,
    effectiveDate: '2026-01-15',
    note: '10% raise',
    items,
    ...extra,
  });

  it('applies the revision and returns the batch', async () => {
    const t = await setup();

    const response = await post(
      t,
      '/api/employees/bulk-salary-changes',
      confirm([
        { employeeId: 1, expectedCurrentAmountMinor: 10_000_000, newAmountMinor: 11_000_000 },
      ]),
    );

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ employeeCount: 1, effectiveDate: '2026-01-15' });
    const detail = await t.app.inject({
      method: 'GET',
      url: '/api/employees/1',
      headers: { cookie: await t.loginCookie() },
    });
    expect(detail.json<{ salary: { amountMinor: number } }>().salary.amountMinor).toBe(11_000_000);
  });

  it('answers a stale preview with 409 in the standard error shape', async () => {
    const t = await setup();

    const response = await post(
      t,
      '/api/employees/bulk-salary-changes',
      confirm([{ employeeId: 1, expectedCurrentAmountMinor: 1, newAmountMinor: 11_000_000 }]),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'STALE_BULK_REVISION' } });
  });

  it('rejects an empty item list with 400', async () => {
    const t = await setup();

    const response = await post(t, '/api/employees/bulk-salary-changes', confirm([]));

    expect(response.statusCode).toBe(400);
  });

  it('rejects a non-JSON body with 415', async () => {
    const t = await setup();

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/employees/bulk-salary-changes',
      payload: 'x',
      headers: { cookie: await t.loginCookie(), 'content-type': 'text/plain' },
    });

    expect(response.statusCode).toBe(415);
  });
});
