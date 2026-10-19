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

describe('GET /api/reference/fx/convert', () => {
  it('converts between two non-USD currencies in one rounding step', async () => {
    const t = await setup();

    // 5,000,000.00 INR at 0.01198 USD = 59,900.00 USD; / 1.08 USD per EUR = 55,462.96 EUR.
    const response = await get(
      t,
      '/api/reference/fx/convert?amountMinor=500000000&from=INR&to=EUR',
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ amountMinor: 5_546_296, currencyCode: 'EUR' });
  });

  it('converts to and from the base currency', async () => {
    const t = await setup();

    const toUsd = await get(t, '/api/reference/fx/convert?amountMinor=500000000&from=INR&to=USD');
    const fromUsd = await get(t, '/api/reference/fx/convert?amountMinor=5990000&from=USD&to=INR');

    expect(toUsd.json()).toEqual({ amountMinor: 5_990_000, currencyCode: 'USD' });
    expect(fromUsd.json()).toEqual({ amountMinor: 500_000_000, currencyCode: 'INR' });
  });

  it('returns the amount unchanged for the same currency', async () => {
    const t = await setup();

    const response = await get(t, '/api/reference/fx/convert?amountMinor=123&from=EUR&to=EUR');

    expect(response.json()).toEqual({ amountMinor: 123, currencyCode: 'EUR' });
  });

  it('rejects an unknown currency, a fractional amount and a missing parameter', async () => {
    const t = await setup();

    for (const query of [
      'amountMinor=100&from=INR&to=XYZ',
      'amountMinor=100&from=XYZ&to=INR',
      'amountMinor=10.5&from=INR&to=EUR',
      'amountMinor=-1&from=INR&to=EUR',
      'from=INR&to=EUR',
    ]) {
      const response = await get(t, `/api/reference/fx/convert?${query}`);

      expect(response.statusCode, query).toBe(400);
    }
  });
});
