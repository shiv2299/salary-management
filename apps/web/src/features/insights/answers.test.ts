import type { PayrollChangeResponse, PayrollTrendResponse } from '@acme/shared';
import { describe, expect, it } from 'vitest';
import {
  CAUSE_LABELS,
  averageRaiseVsBefore,
  changeVsYearAgo,
  countVsBefore,
  countVsYearAgo,
  payrollChangeAnswer,
  payrollTrendAnswer,
} from './answers';

const summary: PayrollTrendResponse['summary'] = {
  totalBaseMinor: 61_240_000_000,
  yearAgoTotalBaseMinor: 57_664_000_000,
  changeBp: 620,
  headcount: 9577,
  yearAgoHeadcount: 9265,
};

function change(
  changeBaseMinor: number,
  largestAddition: PayrollChangeResponse['largestAddition'],
  amounts: Partial<Record<PayrollChangeResponse['causes'][number]['cause'], number>> = {},
): PayrollChangeResponse {
  return {
    baseCurrency: 'USD',
    from: '2025-01-15',
    to: '2026-01-15',
    fromTotalBaseMinor: 58_830_000_000,
    toTotalBaseMinor: 58_830_000_000 + changeBaseMinor,
    changeBaseMinor,
    causes: (
      ['hires', 'raises', 'promotions', 'relocations', 'corrections', 'leavers'] as const
    ).map((cause) => ({ cause, amountBaseMinor: amounts[cause] ?? 0, count: 0 })),
    largestAddition,
  };
}

describe('payrollTrendAnswer', () => {
  it('says how much payroll rose and how many more people there are', () => {
    expect(payrollTrendAnswer(summary)).toBe(
      'Payroll is $612.4M a year, up 6.2% on 12 months ago, with 312 more people.',
    );
  });

  it('says how much payroll fell and how many fewer people there are', () => {
    expect(payrollTrendAnswer({ ...summary, changeBp: -120, yearAgoHeadcount: 9617 })).toBe(
      'Payroll is $612.4M a year, down 1.2% on 12 months ago, with 40 fewer people.',
    );
  });

  it('says payroll and headcount are unchanged when neither moved', () => {
    expect(payrollTrendAnswer({ ...summary, changeBp: 0, yearAgoHeadcount: 9577 })).toBe(
      'Payroll is $612.4M a year, the same as 12 months ago, with the same headcount.',
    );
  });

  it('gives only the total when there was no payroll a year ago', () => {
    expect(payrollTrendAnswer({ ...summary, changeBp: null })).toBe('Payroll is $612.4M a year.');
  });

  it('speaks of one person in the singular', () => {
    expect(payrollTrendAnswer({ ...summary, yearAgoHeadcount: 9576 })).toBe(
      'Payroll is $612.4M a year, up 6.2% on 12 months ago, with 1 more person.',
    );
  });
});

describe('payrollChangeAnswer', () => {
  it('says how much payroll rose and which cause added the most', () => {
    expect(payrollChangeAnswer(change(2_410_000_000, 'raises', { raises: 1_520_000_000 }))).toBe(
      'Payroll rose $24.1M in the last 12 months. Raises added the most: $15.2M.',
    );
  });

  it('says how much payroll fell and still names the cause that added the most', () => {
    expect(
      payrollChangeAnswer(
        change(-320_000_000, 'hires', { hires: 500_000_000, leavers: -820_000_000 }),
      ),
    ).toBe('Payroll fell $3.2M in the last 12 months. New hires added the most: $5M.');
  });

  it('leaves out the cause sentence when nothing added to payroll', () => {
    expect(payrollChangeAnswer(change(-320_000_000, null, { leavers: -320_000_000 }))).toBe(
      'Payroll fell $3.2M in the last 12 months.',
    );
  });

  it('says payroll is unchanged when the change is zero', () => {
    expect(payrollChangeAnswer(change(0, null))).toBe('Payroll is the same as 12 months ago.');
  });
});

describe('CAUSE_LABELS', () => {
  it('names every cause in plain words', () => {
    expect(Object.values(CAUSE_LABELS)).toEqual([
      'New hires',
      'Raises',
      'Promotions',
      'Relocations',
      'Corrections',
      'People who left',
    ]);
  });
});

describe('tile hints', () => {
  it('compares a percentage change with 12 months ago, with an arrow beside the number', () => {
    expect(changeVsYearAgo(620)).toBe('↑ 6.2% vs 12 months ago');
    expect(changeVsYearAgo(-120)).toBe('↓ 1.2% vs 12 months ago');
    expect(changeVsYearAgo(0)).toBe('No change vs 12 months ago');
    expect(changeVsYearAgo(null)).toBe('—');
  });

  it('compares a count with 12 months ago', () => {
    expect(countVsYearAgo(9577, 9265)).toBe('↑ 312 vs 12 months ago');
    expect(countVsYearAgo(9225, 9265)).toBe('↓ 40 vs 12 months ago');
    expect(countVsYearAgo(9265, 9265)).toBe('No change vs 12 months ago');
  });

  it('compares the average raise with the 12 months before', () => {
    expect(averageRaiseVsBefore(440, 460)).toBe('↓ from 4.6% the 12 months before');
    expect(averageRaiseVsBefore(480, 460)).toBe('↑ from 4.6% the 12 months before');
    expect(averageRaiseVsBefore(460, 460)).toBe('Same as the 12 months before');
    expect(averageRaiseVsBefore(440, null)).toBe('No raises the 12 months before');
    expect(averageRaiseVsBefore(null, 460)).toBe('No raises in the last 12 months');
  });

  it('compares a count with the 12 months before', () => {
    expect(countVsBefore(412, 380)).toBe('↑ from 380 the 12 months before');
    expect(countVsBefore(350, 380)).toBe('↓ from 380 the 12 months before');
    expect(countVsBefore(380, 380)).toBe('Same as the 12 months before');
    expect(countVsBefore(1412, 1380)).toBe('↑ from 1,380 the 12 months before');
  });
});
