import { describe, expect, it } from 'vitest';
import {
  RANGE_OPTIONS,
  toDistributionChartRows,
  toPayrollChartRows,
  trendPointsInRange,
  yearsInRange,
} from './chart-data';

describe('toDistributionChartRows', () => {
  it('splits each group into stacked segments that add up to its maximum', () => {
    const rows = toDistributionChartRows({
      baseCurrency: 'USD',
      groupBy: 'country',
      groups: [
        {
          key: 'IN',
          label: 'India',
          distribution: {
            headcount: 100,
            min: 1_000,
            max: 9_000,
            mean: 4_000,
            median: 4_200,
            p25: 2_000,
            p75: 6_000,
            p90: 7_500,
          },
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        key: 'IN',
        label: 'India',
        headcount: 100,
        offset: 1_000,
        lowerWhisker: 1_000,
        lowerBox: 2_200,
        upperBox: 1_800,
        upperWhisker: 3_000,
      }),
    ]);
    const [row] = rows;
    expect(
      (row?.offset ?? 0) +
        (row?.lowerWhisker ?? 0) +
        (row?.lowerBox ?? 0) +
        (row?.upperBox ?? 0) +
        (row?.upperWhisker ?? 0),
    ).toBe(9_000);
  });

  it('keeps the statistics for the tooltip and the table untouched', () => {
    const [row] = toDistributionChartRows({
      baseCurrency: 'USD',
      groupBy: 'level',
      groups: [
        {
          key: '3',
          label: 'L3',
          distribution: {
            headcount: 3,
            min: 10,
            max: 30,
            mean: 20,
            median: 20,
            p25: 15,
            p75: 25,
            p90: 28,
          },
        },
      ],
    });

    expect(row?.stats).toMatchObject({ mean: 20, p90: 28, median: 20 });
  });
});

describe('toPayrollChartRows', () => {
  it('maps each group to a labeled bar with its headcount', () => {
    const rows = toPayrollChartRows({
      baseCurrency: 'USD',
      groupBy: 'department',
      headcount: 5,
      totalBaseMinor: 500,
      groups: [
        { key: '1', label: 'Engineering', headcount: 3, totalBaseMinor: 300 },
        { key: '2', label: 'Sales', headcount: 2, totalBaseMinor: 200 },
      ],
    });

    expect(rows).toEqual([
      { key: '1', label: 'Engineering', headcount: 3, totalBaseMinor: 300 },
      { key: '2', label: 'Sales', headcount: 2, totalBaseMinor: 200 },
    ]);
  });
});

describe('RANGE_OPTIONS', () => {
  it('offers three, five and ten years and all', () => {
    expect(RANGE_OPTIONS.map((option) => option.label)).toEqual(['3Y', '5Y', '10Y', 'All']);
  });
});

describe('trendPointsInRange', () => {
  const points = [
    ...Array.from({ length: 10 }, (_, index) => ({ year: 2016 + index, isToday: false })),
    { year: 2026, isToday: true },
  ];

  it('keeps the last three year ends and today for three years', () => {
    expect(trendPointsInRange(points, '3y')).toEqual([
      { year: 2023, isToday: false },
      { year: 2024, isToday: false },
      { year: 2025, isToday: false },
      { year: 2026, isToday: true },
    ]);
  });

  it('keeps every point for all', () => {
    expect(trendPointsInRange(points, 'all')).toEqual(points);
  });

  it('keeps every point when there are fewer year ends than the range', () => {
    expect(trendPointsInRange(points.slice(8), '5y')).toEqual(points.slice(8));
  });
});

describe('yearsInRange', () => {
  const years = Array.from({ length: 10 }, (_, index) => ({ year: 2017 + index }));

  it('keeps this year and the two before it for three years', () => {
    expect(yearsInRange(years, '3y', 2026).map((entry) => entry.year)).toEqual([2024, 2025, 2026]);
  });

  it('keeps every year for all', () => {
    expect(yearsInRange(years, 'all', 2026)).toEqual(years);
  });
});
