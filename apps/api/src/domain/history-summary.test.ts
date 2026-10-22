import { describe, expect, it } from 'vitest';
import { summariseHistory } from './history-summary';

const rates = { INR: 11_980_000, EUR: 1_080_000_000 };
const usd = (id: number, effectiveDate: string, amountMinor: number, reason: string) => ({
  id,
  effectiveDate,
  amountMinor,
  currencyCode: 'USD',
  reason,
});
const career = [
  usd(1, '2016-10-22', 10_000_000, 'hire'),
  usd(2, '2018-04-01', 10_500_000, 'raise'),
  usd(3, '2020-04-01', 12_075_000, 'promotion'),
  usd(4, '2022-04-01', 12_678_750, 'raise'),
  usd(5, '2024-04-01', 13_312_688, 'raise'),
  usd(6, '2025-04-01', 14_802_443, 'raise'),
];

describe('summariseHistory', () => {
  it('gives the change since hire, compound yearly growth, the biggest jump and the counts', () => {
    expect(summariseHistory(career, rates, '2026-10-22')).toEqual({
      currencyCode: 'USD',
      convertedToUsd: false,
      hireAmountMinor: 10_000_000,
      currentAmountMinor: 14_802_443,
      sinceHireBp: 4802,
      averageYearlyGrowthBp: 400,
      biggestJump: {
        historyId: 3,
        changeBp: 1500,
        effectiveDate: '2020-04-01',
        reason: 'promotion',
      },
      promotionCount: 1,
      raiseCount: 4,
    });
  });

  it('measures yearly growth up to the end date it is given', () => {
    expect(summariseHistory(career, rates, '2024-10-22').averageYearlyGrowthBp).toBe(502);
  });

  it('works in USD at the given rates when the pay moved between currencies', () => {
    const moved = [
      {
        id: 1,
        effectiveDate: '2020-01-01',
        amountMinor: 100_000_000,
        currencyCode: 'INR',
        reason: 'hire',
      },
      {
        id: 2,
        effectiveDate: '2023-01-01',
        amountMinor: 6_000_000,
        currencyCode: 'USD',
        reason: 'relocation',
      },
    ];
    expect(summariseHistory(moved, rates, '2026-10-22')).toEqual({
      currencyCode: 'USD',
      convertedToUsd: true,
      hireAmountMinor: 1_198_000,
      currentAmountMinor: 6_000_000,
      sinceHireBp: 40083,
      averageYearlyGrowthBp: 2671,
      biggestJump: {
        historyId: 2,
        changeBp: 40083,
        effectiveDate: '2023-01-01',
        reason: 'relocation',
      },
      promotionCount: 0,
      raiseCount: 0,
    });
  });

  it('starts from the corrected pay when the hire pay was corrected on the hire day', () => {
    const corrected = [
      usd(1, '2020-01-01', 10_000_000, 'hire'),
      usd(2, '2020-01-01', 10_500_000, 'correction'),
      usd(3, '2022-01-01', 11_025_000, 'raise'),
    ];
    expect(summariseHistory(corrected, rates, '2026-10-22')).toMatchObject({
      hireAmountMinor: 10_500_000,
      sinceHireBp: 500,
      biggestJump: { historyId: 3, changeBp: 500 },
    });
    expect(summariseHistory(corrected.slice(0, 2), rates, '2026-10-22')).toMatchObject({
      hireAmountMinor: 10_500_000,
      sinceHireBp: null,
      biggestJump: null,
    });
  });

  it('has no growth figures for an employee with only the hire row', () => {
    expect(
      summariseHistory([usd(1, '2026-10-15', 9_000_000, 'hire')], rates, '2026-10-22'),
    ).toEqual({
      currencyCode: 'USD',
      convertedToUsd: false,
      hireAmountMinor: 9_000_000,
      currentAmountMinor: 9_000_000,
      sinceHireBp: null,
      averageYearlyGrowthBp: null,
      biggestJump: null,
      promotionCount: 0,
      raiseCount: 0,
    });
  });

  it('has no yearly growth under a year of history', () => {
    const short = [
      usd(1, '2026-01-01', 10_000_000, 'hire'),
      usd(2, '2026-06-01', 10_500_000, 'raise'),
    ];
    expect(summariseHistory(short, rates, '2026-10-22')).toMatchObject({
      sinceHireBp: 500,
      averageYearlyGrowthBp: null,
    });
  });

  it('picks the earliest of two equal increases and ignores a correction downwards', () => {
    const rows = [
      usd(1, '2020-01-01', 10_000_000, 'hire'),
      usd(2, '2021-01-01', 10_500_000, 'raise'),
      usd(3, '2022-01-01', 9_975_000, 'correction'),
      usd(4, '2023-01-01', 10_473_750, 'raise'),
    ];
    expect(summariseHistory(rows, rates, '2026-10-22').biggestJump).toMatchObject({
      historyId: 2,
      changeBp: 500,
    });
    expect(
      summariseHistory([rows[0]!, { ...rows[2]!, id: 2 }], rates, '2026-10-22').biggestJump,
    ).toBeNull();
  });
});
