// Sentence templates for the Insights page. Every number in them is an API figure, formatted here;
// the only arithmetic is the difference or sum of two headcounts and comparisons between two figures.

import type {
  AttentionResponse,
  LevelBandsResponse,
  PAYROLL_CAUSES,
  PayrollChangeResponse,
  PayrollTrendResponse,
  RaiseStatsResponse,
} from '@acme/shared';
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

/** 13,500 → "1.35×", 16,000 → "1.6×": the point is moved four places, then shown to two decimals. */
export function formatRatioBp(bp: number): string {
  const digits = String(bp).padStart(5, '0');
  const decimal = `${digits.slice(0, -4)}.${digits.slice(-4)}`;
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    decimal as unknown as number,
  );
  return `${text}×`;
}

/** "Raises in the last 12 months averaged 4.4%, down from 4.6% the 12 months before. …" */
export function raisesAnswer(
  trailing: RaiseStatsResponse['trailing'],
  currencyCode = 'USD',
): string {
  const { current, previous } = trailing;
  const added =
    current.totalAddedBaseMinor === 0
      ? ''
      : ` Raises and promotions added ${formatMoneyCompact(current.totalAddedBaseMinor, currencyCode)} to annual payroll.`;
  if (current.averageRaiseBp === null) return `No raises in the last 12 months.${added}`;
  const average = `Raises in the last 12 months averaged ${formatPercentageBp(current.averageRaiseBp)}`;
  if (previous.averageRaiseBp === null) return `${average}.${added}`;
  const comparison =
    current.averageRaiseBp === previous.averageRaiseBp
      ? 'the same as the 12 months before'
      : `${current.averageRaiseBp > previous.averageRaiseBp ? 'up' : 'down'} from ${formatPercentageBp(previous.averageRaiseBp)} the 12 months before`;
  return `${average}, ${comparison}.${added}`;
}

/** "Each level pays 1.35–1.4× the one below. 12.34% of L2s earn more than the typical L3. …" */
export function levelBandsAnswer(bands: LevelBandsResponse, countryName: string): string {
  const { stepRange, largestOverlap, widestSpread } = bands.summary;
  if (stepRange === null) return `Too few people in ${countryName} to compare levels.`;
  const step =
    stepRange.minBp === stepRange.maxBp
      ? formatRatioBp(stepRange.minBp)
      : `${formatRatioBp(stepRange.minBp).replace('×', '')}–${formatRatioBp(stepRange.maxBp)}`;
  const sentences = [`Each level pays ${step} the one below.`];
  if (largestOverlap) {
    sentences.push(
      `${formatPercentageBp(largestOverlap.shareBp)} of ${largestOverlap.levelCode}s earn more than the typical ${largestOverlap.nextLevelCode}.`,
    );
  }
  if (widestSpread) sentences.push(`Pay varies most within ${widestSpread.levelCode}.`);
  return sentences.join(' ');
}

/** "187 people are paid outside their peer range and 381 have had no raise in over 2 years. …" */
export function attentionAnswer(attention: AttentionResponse): string {
  const outside = attention.outlierAbove + attention.outlierBelow;
  const people = outside === 1 ? '1 person is' : `${count(outside)} people are`;
  const noRaise = `${count(attention.noRaise2y)} ${attention.noRaise2y === 1 ? 'has' : 'have'}`;
  const first = `${people} paid outside their peer range and ${noRaise} had no raise in over 2 years.`;
  const groups = attention.compression.groups.length;
  if (groups === 0) return first;
  return `${first} In ${count(groups)} country and level ${groups === 1 ? 'group' : 'groups'}, new hires are paid more than long-tenured staff.`;
}
