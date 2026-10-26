import type { PayrollResponse } from '@acme/shared';

export type YearRange = '3y' | '5y' | '10y' | 'all';

export const RANGE_OPTIONS: { value: YearRange; label: string }[] = [
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
  { value: '10y', label: '10Y' },
  { value: 'all', label: 'All' },
];

const RANGE_YEARS: Record<Exclude<YearRange, 'all'>, number> = { '3y': 3, '5y': 5, '10y': 10 };

/** Year-end points of the last N years plus today ('all' keeps every point). */
export function trendPointsInRange<T extends { year: number; isToday: boolean }>(
  points: T[],
  range: YearRange,
): T[] {
  if (range === 'all') return points;
  const kept = new Set(points.filter((point) => !point.isToday).slice(-RANGE_YEARS[range]));
  return points.filter((point) => point.isToday || kept.has(point));
}

/** This year and the N − 1 before it ('all' keeps every year). */
export function yearsInRange<T extends { year: number }>(
  years: T[],
  range: YearRange,
  currentYear: number,
): T[] {
  if (range === 'all') return years;
  const firstYear = currentYear - RANGE_YEARS[range] + 1;
  return years.filter((entry) => entry.year >= firstYear && entry.year <= currentYear);
}

// The helper below feeds the payroll panel, which the question cards replace.

export interface PayrollChartRow {
  key: string;
  label: string;
  headcount: number;
  totalBaseMinor: number;
}

export function toPayrollChartRows(response: PayrollResponse): PayrollChartRow[] {
  return response.groups.map(({ key, label, headcount, totalBaseMinor }) => ({
    key,
    label,
    headcount,
    totalBaseMinor,
  }));
}
