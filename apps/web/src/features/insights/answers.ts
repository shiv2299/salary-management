// Sentence templates for the Insights page. Every number in them is an API figure, formatted here;
// the only arithmetic is the difference of two headcounts and comparisons between two figures.

import type { PAYROLL_CAUSES, PayrollChangeResponse, PayrollTrendResponse } from '@acme/shared';
import { formatMoneyCompact, formatPercentageBp } from '@/lib/money';

export type PayrollCause = (typeof PAYROLL_CAUSES)[number];

export const CAUSE_LABELS: Record<PayrollCause, string> = {
  hires: 'New hires',
  raises: 'Raises',
  promotions: 'Promotions',
  relocations: 'Relocations',
  corrections: 'Corrections',
  leavers: 'People who left',
};

const UP = '↑';
const DOWN = '↓';
const MISSING = '—';

function count(value: number): string {
  return value.toLocaleString('en-US');
}

/** "6.2%" for 620 or -620: the direction is carried by the words or the arrow around it. */
function percentage(bp: number): string {
  return formatPercentageBp(Math.abs(bp));
}

function headcountClause(current: number, previous: number): string {
  const difference = current - previous;
  if (difference === 0) return 'with the same headcount';
  const size = Math.abs(difference);
  return `with ${count(size)} ${difference > 0 ? 'more' : 'fewer'} ${size === 1 ? 'person' : 'people'}`;
}

/** "Payroll is $612.4M a year, up 6.2% on 12 months ago, with 312 more people." */
export function payrollTrendAnswer(
  summary: PayrollTrendResponse['summary'],
  currencyCode = 'USD',
): string {
  const total = `Payroll is ${formatMoneyCompact(summary.totalBaseMinor, currencyCode)} a year`;
  if (summary.changeBp === null) return `${total}.`;
  const change =
    summary.changeBp === 0
      ? 'the same as 12 months ago'
      : `${summary.changeBp > 0 ? 'up' : 'down'} ${percentage(summary.changeBp)} on 12 months ago`;
  return `${total}, ${change}, ${headcountClause(summary.headcount, summary.yearAgoHeadcount)}.`;
}

/** "Payroll rose $24.1M in the last 12 months. Raises added the most: $15.2M." */
export function payrollChangeAnswer(change: PayrollChangeResponse): string {
  const money = (amount: number) => formatMoneyCompact(amount, change.baseCurrency);
  const total =
    change.changeBaseMinor === 0
      ? 'Payroll is the same as 12 months ago.'
      : `Payroll ${change.changeBaseMinor > 0 ? 'rose' : 'fell'} ${money(Math.abs(change.changeBaseMinor))} in the last 12 months.`;
  const largest = change.causes.find((entry) => entry.cause === change.largestAddition);
  if (!largest) return total;
  return `${total} ${CAUSE_LABELS[largest.cause]} added the most: ${money(largest.amountBaseMinor)}.`;
}

/** Tile hint: "↑ 6.2% vs 12 months ago". */
export function changeVsYearAgo(changeBp: number | null): string {
  if (changeBp === null) return MISSING;
  if (changeBp === 0) return 'No change vs 12 months ago';
  return `${changeBp > 0 ? UP : DOWN} ${percentage(changeBp)} vs 12 months ago`;
}

/** Tile hint: "↑ 312 vs 12 months ago". */
export function countVsYearAgo(current: number, previous: number): string {
  const difference = current - previous;
  if (difference === 0) return 'No change vs 12 months ago';
  return `${difference > 0 ? UP : DOWN} ${count(Math.abs(difference))} vs 12 months ago`;
}

function versusBefore(current: number, previous: number, previousText: string): string {
  if (current === previous) return 'Same as the 12 months before';
  return `${current > previous ? UP : DOWN} from ${previousText} the 12 months before`;
}

/** Tile hint: "↓ from 4.6% the 12 months before". */
export function averageRaiseVsBefore(current: number | null, previous: number | null): string {
  if (current === null) return 'No raises in the last 12 months';
  if (previous === null) return 'No raises the 12 months before';
  return versusBefore(current, previous, formatPercentageBp(previous));
}

/** Tile hint: "↑ from 380 the 12 months before". */
export function countVsBefore(current: number, previous: number): string {
  return versusBefore(current, previous, count(previous));
}
