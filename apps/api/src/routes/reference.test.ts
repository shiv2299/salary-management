import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/test-app';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let current: TestApp | undefined;

async function setup() {
  current = await createTestApp();
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

describe('reference data endpoints', () => {
  it('lists countries with their currency, ordered by name', async () => {
    const t = await setup();

    const response = await get(t, '/api/reference/countries');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { code: 'DE', name: 'Germany', currencyCode: 'EUR' },
      { code: 'IN', name: 'India', currencyCode: 'INR' },
      { code: 'US', name: 'United States', currencyCode: 'USD' },
    ]);
  });

  it('lists departments by name', async () => {
    const t = await setup();

    const response = await get(t, '/api/reference/departments');

    expect(response.json()).toEqual([{ id: 1, name: 'Engineering' }]);
  });

  it('lists levels ordered by rank', async () => {
    const t = await setup();

    const response = await get(t, '/api/reference/levels');

    expect(response.json()).toEqual([
      { id: 1, code: 'L1', label: 'Junior', rank: 1 },
      { id: 2, code: 'L2', label: 'Mid', rank: 2 },
      { id: 3, code: 'L3', label: 'Senior', rank: 3 },
    ]);
  });

  it('lists the latest FX rate for each currency with its date and the base currency', async () => {
    const t = await setup();

    const response = await get(t, '/api/reference/fx-rates');

    expect(response.json()).toEqual({
      baseCurrency: 'USD',
      rates: [
        { currencyCode: 'EUR', asOfDate: '2025-01-01', rateToBaseNano: 1_080_000_000 },
        { currencyCode: 'INR', asOfDate: '2025-01-01', rateToBaseNano: 11_980_000 },
      ],
    });
  });

  it('requires a session', async () => {
    const t = await setup();

    const response = await t.app.inject({ method: 'GET', url: '/api/reference/countries' });

    expect(response.statusCode).toBe(401);
  });
});
