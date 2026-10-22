import type { SalaryHistoryEntry } from '@acme/shared';
import { describe, expect, it } from 'vitest';
import { employeeDetail, newHireDetail, relocatedDetail } from '@/test/fixtures';
import {
  amountTicks,
  chartLabel,
  historyChart,
  historySummaryText,
  promotionLabel,
  rangeStartDate,
  timeSinceText,
  timeTicks,
  yearTicks,
  type HistoryChart,
} from './history-chart';

describe('history chart helpers', () => {
  it('counts back whole calendar years from the end of the range', () => {
    expect(rangeStartDate('3y', '2026-10-19', '2016-01-01')).toBe('2023-10-19');
    expect(rangeStartDate('5y', '2028-02-29', '2010-01-01')).toBe('2023-02-28');
    expect(rangeStartDate('all', '2026-10-19', '2021-04-12')).toBe('2021-04-12');
  });

  it('never starts a range before the hire date', () => {
    expect(rangeStartDate('10y', '2026-10-19', '2024-05-01')).toBe('2024-05-01');
    const recent = employeeDetail({
      hireDate: '2024-05-01',
      history: [{ ...employeeDetail().history[1]!, effectiveDate: '2024-05-01' }],
    });
    expect(
      historyChart(recent, '10y', '2026-10-19').points.map((p) => [
        p.date,
        p.entry?.reason ?? null,
      ]),
    ).toEqual([
      ['2024-05-01', 'hire'],
      ['2026-10-19', null],
    ]);
  });

  it('steps from the hire through each change to today', () => {
    const chart = historyChart(employeeDetail(), 'all', '2026-10-19');
    expect(chart.points.map((p) => [p.date, p.amountMinor, p.entry?.reason ?? null])).toEqual([
      ['2021-04-12', 450_000_000, 'hire'],
      ['2025-04-01', 500_000_000, 'raise'],
      ['2026-10-19', 500_000_000, null],
    ]);
    expect(chart).toMatchObject({
      startDate: '2021-04-12',
      endDate: '2026-10-19',
      currencyCode: 'INR',
      changeCount: 1,
    });
  });

  it('draws a flat line at the pay in force when the range holds no change', () => {
    const chart = historyChart(employeeDetail(), '3y', '2029-10-19');
    expect(chart.points.map((p) => [p.date, p.amountMinor, p.entry])).toEqual([
      ['2026-10-19', 500_000_000, null],
      ['2029-10-19', 500_000_000, null],
    ]);
    expect(chart.changeCount).toBe(0);
  });

  it("ends an inactive employee's chart on the day they were deactivated", () => {
    expect(
      historyChart(employeeDetail({ deactivatedOn: '2026-03-01' }), 'all', '2026-10-19').endDate,
    ).toBe('2026-03-01');
  });

  it('plots the USD amounts when the pay moved between currencies', () => {
    const moved = relocatedDetail();
    expect(historyChart(moved, 'all', '2026-10-19').points.map((p) => p.amountMinor)).toEqual([
      1_198_000, 6_000_000, 6_000_000,
    ]);
    expect(historyChart(moved, 'all', '2026-10-19').currencyCode).toBe('USD');
  });

  it('labels a promotion with its new level and change', () => {
    const entry = {
      ...employeeDetail().history[0]!,
      reason: 'promotion' as const,
      levelCode: 'L4',
      changeBp: 1500,
    };
    expect(promotionLabel(entry)).toBe('L4 +15%');
    expect(promotionLabel({ ...entry, changeBp: null })).toBe('L4');
    expect(promotionLabel(employeeDetail().history[0]!)).toBeNull();
  });

  it('names the chart for its range and currency', () => {
    expect(chartLabel('all', false)).toBe('Salary over time since hire');
    expect(chartLabel('5y', true)).toBe('Salary over time, last 5 years, in USD');
  });

  it('words the time since a change in months and years', () => {
    expect(timeSinceText('2026-10-19', '2026-10-19')).toBe('Today');
    expect(timeSinceText('2026-10-01', '2026-10-19')).toBe('Less than a month ago');
    expect(timeSinceText('2026-09-19', '2026-10-19')).toBe('1 month ago');
    expect(timeSinceText('2026-04-20', '2026-10-19')).toBe('5 months ago');
    expect(timeSinceText('2024-10-19', '2026-10-19')).toBe('2 years ago');
    expect(timeSinceText('2025-04-01', '2026-10-19')).toBe('1 year, 6 months ago');
  });

  it('sums up the history since hire, or says there has been no change', () => {
    expect(historySummaryText(employeeDetail())).toEqual({
      headline: '₹45,00,000.00 → ₹50,00,000.00 since hire (+11.11%)',
      counts: '0 promotions · 1 raise',
    });
    expect(historySummaryText(newHireDetail())).toEqual({
      headline: 'Hired at ₹45,00,000.00 on 12 Apr 2021. No changes since.',
      counts: null,
    });
  });

  it('puts a tick on each January 1st inside a multi-year range', () => {
    expect(yearTicks('2021-04-12', '2024-10-19')).toEqual([
      Date.parse('2022-01-01T00:00:00Z'),
      Date.parse('2023-01-01T00:00:00Z'),
      Date.parse('2024-01-01T00:00:00Z'),
    ]);
  });

  it('leaves the ticks to the chart when the range lies within one calendar year', () => {
    expect(yearTicks('2026-02-03', '2026-10-19')).toBeUndefined();
  });

  it('leaves the ticks to the chart when a range under two years holds a single New Year', () => {
    expect(yearTicks('2025-05-01', '2026-10-19')).toBeUndefined();
  });

  describe('axis ticks', () => {
    const chartOf = (startDate: string, endDate: string, amounts: number[]): HistoryChart => ({
      startDate,
      endDate,
      currencyCode: 'INR',
      changeCount: 0,
      points: amounts.map((amountMinor, index) => ({
        time: Date.parse(`${index === 0 ? startDate : endDate}T00:00:00Z`),
        date: index === 0 ? startDate : endDate,
        amountMinor,
        entry: null,
      })),
    });
    const t = (date: string) => Date.parse(`${date}T00:00:00Z`);

    it('labels a flat series once, at its amount', () => {
      expect(amountTicks(chartOf('2021-04-12', '2026-10-19', [5_000, 5_000]))).toEqual([5_000]);
    });

    it('leaves the amount ticks to the chart when the pay changes', () => {
      expect(amountTicks(chartOf('2021-04-12', '2026-10-19', [5_000, 6_000]))).toBeUndefined();
    });

    it('labels a range of under two months with its two end dates', () => {
      expect(timeTicks(chartOf('2026-10-01', '2026-10-19', [1, 1]))).toEqual([
        t('2026-10-01'),
        t('2026-10-19'),
      ]);
    });

    it('labels a single date when the range starts and ends on the same day', () => {
      expect(timeTicks(chartOf('2026-10-19', '2026-10-19', [1]))).toEqual([t('2026-10-19')]);
    });

    it('labels a multi-year range by year as before', () => {
      expect(timeTicks(chartOf('2021-04-12', '2024-10-19', [1, 2]))).toEqual([
        t('2022-01-01'),
        t('2023-01-01'),
        t('2024-01-01'),
      ]);
    });
  });

  it('plots a hire pay corrected on the hire day as one starting point, without a step', () => {
    const [raise, hire] = employeeDetail().history as [SalaryHistoryEntry, SalaryHistoryEntry];
    const correction = {
      ...hire,
      id: 90,
      reason: 'correction' as const,
      amountMinor: 460_000_000,
      amountBaseMinor: 460_000_000,
    };
    const detail = employeeDetail({ history: [hire, correction, raise] });
    expect(
      historyChart(detail, 'all', '2026-10-19').points.map((p) => [p.date, p.amountMinor]),
    ).toEqual([
      ['2021-04-12', 460_000_000],
      ['2025-04-01', 500_000_000],
      ['2026-10-19', 500_000_000],
    ]);
    expect(historyChart(detail, 'all', '2026-10-19').changeCount).toBe(2);
  });
});
