import { describe, expect, it } from 'vitest';
import { RANGE_OPTIONS, trendPointsInRange, yearsInRange } from './chart-data';

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
