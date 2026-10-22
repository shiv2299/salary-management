import { describe, expect, it } from 'vitest';
import { bulkRevisionFigures } from './bulk-summary';

const rates = { INR: 11_980_000, EUR: 1_080_000_000 };
const usd = (current: number, next: number) => ({
  currencyCode: 'USD',
  currentAmountMinor: current,
  currentAmountBaseMinor: current,
  newAmountMinor: next,
});

describe('bulkRevisionFigures', () => {
  it('sums the added pay exactly within each currency and converts each sum once for the USD total', () => {
    const rows = [
      usd(10_000_000, 10_700_000),
      usd(20_000_000, 21_000_000),
      {
        currencyCode: 'INR',
        currentAmountMinor: 500_000_000,
        currentAmountBaseMinor: 5_990_000,
        newAmountMinor: 535_000_000,
      },
    ];
    expect(bulkRevisionFigures(rows, rates)).toEqual({
      addedByCurrency: [
        { currencyCode: 'INR', addedMinor: 35_000_000 },
        { currencyCode: 'USD', addedMinor: 1_700_000 },
      ],
      addedBaseMinor: 2_119_300,
      typical: { currencyCode: 'USD', beforeMinor: 10_000_000, afterMinor: 10_700_000 },
    });
  });

  it('gives the typical pay in the local currency when everyone is paid in it', () => {
    const inr = (current: number, base: number, next: number) => ({
      currencyCode: 'INR',
      currentAmountMinor: current,
      currentAmountBaseMinor: base,
      newAmountMinor: next,
    });
    const figures = bulkRevisionFigures(
      [inr(400_000_000, 4_792_000, 428_000_000), inr(500_000_000, 5_990_000, 535_000_000)],
      rates,
    );
    expect(figures.typical).toEqual({
      currencyCode: 'INR',
      beforeMinor: 450_000_000,
      afterMinor: 481_500_000,
    });
    expect(figures.addedBaseMinor).toBe(754_740);
  });

  it('rounds the USD total once per currency, not once per person', () => {
    const row = {
      currencyCode: 'INR',
      currentAmountMinor: 1_000,
      currentAmountBaseMinor: 12,
      newAmountMinor: 1_050,
    };
    expect(bulkRevisionFigures([row, row, row], rates).addedBaseMinor).toBe(2); // per person would give 3
  });

  it('gives no figures for an empty selection', () => {
    expect(bulkRevisionFigures([], rates)).toEqual({
      addedByCurrency: [],
      addedBaseMinor: 0,
      typical: null,
    });
  });
});
