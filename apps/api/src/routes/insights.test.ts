import { afterEach, describe, expect, it } from 'vitest';
import { createEmployees } from '../services/employees';
import { applySalaryChanges } from '../services/salary-writer';
import { FIXED_NOW } from '../test/test-db';
import { createTestApp } from '../test/test-app';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let current: TestApp | undefined;

const deps = { now: () => FIXED_NOW };

async function setup() {
  // The clock is the day FIXED_NOW falls on, so the windows below are predictable.
  current = await createTestApp({ now: () => new Date(FIXED_NOW) });
  const ids = createEmployees(
    current.database.db,
    [100_000, 200_000, 300_000].map((amountMinor, i) => ({
      firstName: `Person${i}`,
      lastName: 'Rao',
      email: `p${i}@acme.test`,
      countryCode: 'US',
      departmentId: 1,
      levelId: 1,
      jobTitle: 'Engineer',
      hireDate: '2015-03-01',
      amountMinor,
    })),
    deps,
  );
  return { t: current, ids };
}

afterEach(async () => {
  await current?.app.close();
  current?.database.close();
  current = undefined;
});

async function get(t: TestApp, url: string) {
  return t.app.inject({ method: 'GET', url, headers: { cookie: await t.loginCookie() } });
}

describe.each([
  '/api/insights/distribution?groupBy=country',
  '/api/insights/payroll?groupBy=country',
  '/api/insights/outliers',
  '/api/insights/recent-changes',
])('GET %s', (url) => {
  it('requires a session', async () => {
    current = await createTestApp();

    const response = await current.app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/insights/distribution', () => {
  it('returns the distribution of each group in USD', async () => {
    const { t } = await setup();

    const response = await get(t, '/api/insights/distribution?groupBy=country');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      baseCurrency: 'USD',
      groupBy: 'country',
      groups: [
        {
          key: 'US',
          label: 'United States',
          distribution: {
            headcount: 3,
            min: 100_000,
            max: 300_000,
            mean: 200_000,
            median: 200_000,
            p25: 150_000,
            p75: 250_000,
            p90: 280_000,
          },
        },
      ],
    });
  });

  it('rejects a missing or unknown grouping with a validation error', async () => {
    const { t } = await setup();

    expect((await get(t, '/api/insights/distribution')).statusCode).toBe(400);
    const response = await get(t, '/api/insights/distribution?groupBy=gender');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('GET /api/insights/payroll', () => {
  it('returns the total payroll per group and overall', async () => {
    const { t } = await setup();

    const response = await get(t, '/api/insights/payroll?groupBy=department');

    expect(response.json()).toEqual({
      baseCurrency: 'USD',
      groupBy: 'department',
      headcount: 3,
      totalBaseMinor: 600_000,
      groups: [{ key: '1', label: 'Engineering', headcount: 3, totalBaseMinor: 600_000 }],
    });
  });

  it('does not offer a grouping by level', async () => {
    const { t } = await setup();

    expect((await get(t, '/api/insights/payroll?groupBy=level')).statusCode).toBe(400);
  });
});

describe('GET /api/insights/outliers', () => {
  it('returns an empty list when no peer group is large enough to evaluate', async () => {
    const { t } = await setup();

    const response = await get(t, '/api/insights/outliers');

    expect(response.json()).toEqual({ baseCurrency: 'USD', total: 0, items: [] });
  });
});

describe('GET /api/insights/recent-changes', () => {
  it('defaults to the last three years, newest first, with pagination metadata', async () => {
    const { t, ids } = await setup();
    applySalaryChanges(
      t.database.db,
      [
        {
          employeeId: ids[0]!,
          reason: 'raise',
          amountMinor: 110_000,
          currencyCode: 'USD',
          effectiveDate: '2025-06-01',
        },
        {
          employeeId: ids[1]!,
          reason: 'raise',
          amountMinor: 220_000,
          currencyCode: 'USD',
          effectiveDate: '2022-01-15',
        },
      ],
      deps,
    );

    const three = (await get(t, '/api/insights/recent-changes')).json<{
      years: number;
      total: number;
      limit: number;
      offset: number;
      items: { effectiveDate: string }[];
    }>();
    const five = (await get(t, '/api/insights/recent-changes?years=5')).json<{
      items: { effectiveDate: string }[];
    }>();

    expect(three).toMatchObject({ years: 3, total: 1, limit: 50, offset: 0 });
    expect(three.items.map((i) => i.effectiveDate)).toEqual(['2025-06-01']);
    expect(five.items.map((i) => i.effectiveDate)).toEqual(['2025-06-01', '2022-01-15']);
  });

  it('applies limit and offset to the entries', async () => {
    const { t, ids } = await setup();
    applySalaryChanges(
      t.database.db,
      ids.map((employeeId, i) => ({
        employeeId,
        reason: 'raise' as const,
        amountMinor: 1_000_000,
        currencyCode: 'USD',
        effectiveDate: `2025-0${i + 1}-01`,
      })),
      deps,
    );

    const response = await get(t, '/api/insights/recent-changes?limit=1&offset=1');

    const body = response.json<{ total: number; items: { effectiveDate: string }[] }>();
    expect(body.total).toBe(3);
    expect(body.items.map((i) => i.effectiveDate)).toEqual(['2025-02-01']);
  });

  it('rejects a window other than 3 or 5 years', async () => {
    const { t } = await setup();

    expect((await get(t, '/api/insights/recent-changes?years=4')).statusCode).toBe(400);
    expect((await get(t, '/api/insights/recent-changes?limit=0')).statusCode).toBe(400);
    expect((await get(t, '/api/insights/recent-changes?offset=-1')).statusCode).toBe(400);
  });
});
