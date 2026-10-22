import type { EmployeeDetail, SalaryHistoryEntry } from '@acme/shared';
import { formatChangeBp, formatMoney } from '@/lib/money';
import { formatDate } from '@/features/reference/use-reference';

export type HistoryRange = '3y' | '5y' | '10y' | 'all';

export const HISTORY_RANGES: { value: HistoryRange; label: string }[] = [
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
  { value: '10y', label: '10Y' },
  { value: 'all', label: 'All' },
];

export const DEFAULT_HISTORY_RANGE: HistoryRange = 'all';

export const REASON_COLORS: Record<SalaryHistoryEntry['reason'], string> = {
  hire: 'var(--text-primary)',
  raise: 'var(--positive)',
  promotion: 'var(--series-promotion)',
  relocation: 'var(--text-secondary)',
  correction: 'var(--warning)',
};

export interface HistoryChartPoint {
  time: number;
  date: string;
  amountMinor: number;
  /** Null for the edge points that open and close the range. */
  entry: SalaryHistoryEntry | null;
}

export interface HistoryChart {
  startDate: string;
  endDate: string;
  currencyCode: string;
  points: HistoryChartPoint[];
  changeCount: number;
}

const RANGE_YEARS: Record<Exclude<HistoryRange, 'all'>, number> = { '3y': 3, '5y': 5, '10y': 10 };

export function toTime(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Ranges shorter than this show just their two end dates on the time axis. */
const SHORT_RANGE_DAYS = 62;

export function isShortRange(startDate: string, endDate: string): boolean {
  return (toTime(endDate) - toTime(startDate)) / 86_400_000 < SHORT_RANGE_DAYS;
}

/**
 * January 1st of each year inside the range, thinned to at most about six labels. Undefined when
 * fewer than two fall inside it, so the chart picks month ticks instead of a lone year label.
 */
export function yearTicks(startDate: string, endDate: string): number[] | undefined {
  const years: number[] = [];
  for (
    let year = Number(startDate.slice(0, 4)) + 1;
    year <= Number(endDate.slice(0, 4));
    year += 1
  ) {
    years.push(year);
  }
  if (years.length < 2) return undefined;
  const step = Math.max(1, Math.ceil(years.length / 6));
  return years
    .filter((_, index) => index % step === 0)
    .map((year) => toTime(`${String(year).padStart(4, '0')}-01-01`));
}

/**
 * Where the time axis is labelled: both end dates for a range of under about two months (just one
 * when they coincide), the years for a longer range, or undefined to let the chart choose.
 */
export function timeTicks(chart: HistoryChart): number[] | undefined {
  if (isShortRange(chart.startDate, chart.endDate)) {
    const start = toTime(chart.startDate);
    const end = toTime(chart.endDate);
    return start === end ? [start] : [start, end];
  }
  return yearTicks(chart.startDate, chart.endDate);
}

/** One label at the pay when it never changes in the range, otherwise undefined for the chart's own. */
export function amountTicks(chart: HistoryChart): number[] | undefined {
  const first = chart.points[0];
  if (!first || chart.points.some((point) => point.amountMinor !== first.amountMinor)) {
    return undefined;
  }
  return [first.amountMinor];
}

/** N calendar years before the end date (29 Feb becomes 28 Feb), never before the hire date. */
export function rangeStartDate(range: HistoryRange, endDate: string, hireDate: string): string {
  if (range === 'all') return hireDate;
  const year = Number(endDate.slice(0, 4)) - RANGE_YEARS[range];
  const monthDay = endDate.slice(5);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const start = `${String(year).padStart(4, '0')}-${monthDay === '02-29' && !leap ? '02-28' : monthDay}`;
  return start < hireDate ? hireDate : start;
}

export function historyChart(
  employee: EmployeeDetail,
  range: HistoryRange,
  today: string,
): HistoryChart {
  const { convertedToUsd, currencyCode } = employee.historySummary;
  const endDate = employee.deactivatedOn ?? today;
  const startDate = rangeStartDate(range, endDate, employee.hireDate);
  const rows = [...employee.history].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id - b.id,
  );
  const amountOf = (entry: SalaryHistoryEntry) =>
    convertedToUsd ? entry.amountBaseMinor : entry.amountMinor;
  const point = (
    date: string,
    amountMinor: number,
    entry: SalaryHistoryEntry | null,
  ): HistoryChartPoint => ({ time: toTime(date), date, amountMinor, entry });

  const inForceAt = (date: string) => rows.filter((row) => row.effectiveDate <= date).at(-1);
  const inRange = rows.filter(
    (row) => row.effectiveDate >= startDate && row.effectiveDate <= endDate,
  );

  const points: HistoryChartPoint[] = [];
  const opening = inForceAt(startDate) ?? rows[0];
  if (opening && !inRange.some((row) => row.effectiveDate === startDate)) {
    points.push(point(startDate, amountOf(opening), null));
  }
  const hireDay = rows[0]?.effectiveDate;
  const hireDayRows = inRange.filter((row) => row.effectiveDate === hireDay);
  for (const row of inRange) {
    if (row.effectiveDate === hireDay && hireDayRows.length > 1) {
      // A correction made on the hire day is the starting pay: one point, with no step.
      if (row === hireDayRows[0]) {
        points.push(point(row.effectiveDate, amountOf(hireDayRows.at(-1)!), row));
      }
      continue;
    }
    points.push(point(row.effectiveDate, amountOf(row), row));
  }
  const closing = inForceAt(endDate);
  if (closing && closing.effectiveDate !== endDate) {
    points.push(point(endDate, amountOf(closing), null));
  }

  return {
    startDate,
    endDate,
    currencyCode,
    points,
    changeCount: inRange.filter((row) => row.reason !== 'hire').length,
  };
}

/** "L4 +15%" for a promotion, "L4" when it carries no %, null for any other reason. */
export function promotionLabel(entry: SalaryHistoryEntry): string | null {
  if (entry.reason !== 'promotion') return null;
  return entry.changeBp === null
    ? entry.levelCode
    : `${entry.levelCode} ${formatChangeBp(entry.changeBp)}`;
}

export function chartLabel(range: HistoryRange, convertedToUsd: boolean): string {
  const base =
    range === 'all'
      ? 'Salary over time since hire'
      : `Salary over time, last ${RANGE_YEARS[range]} years`;
  return convertedToUsd ? `${base}, in USD` : base;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function historySummaryText(employee: EmployeeDetail): {
  headline: string;
  counts: string | null;
} {
  const summary = employee.historySummary;
  const hired = formatMoney(summary.hireAmountMinor, summary.currencyCode);
  if (employee.history.length <= 1) {
    return {
      headline: `Hired at ${hired} on ${formatDate(employee.hireDate)}. No changes since.`,
      counts: null,
    };
  }
  const now = formatMoney(summary.currentAmountMinor, summary.currencyCode);
  const change = summary.sinceHireBp === null ? '' : ` (${formatChangeBp(summary.sinceHireBp)})`;
  return {
    headline: `${hired} → ${now} since hire${change}`,
    counts: `${plural(summary.promotionCount, 'promotion')} · ${plural(summary.raiseCount, 'raise')}`,
  };
}

/** Whole calendar months between two dates, worded as months or years and months. */
export function timeSinceText(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return 'Today';
  const [y1, m1, d1] = fromDate.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = toDate.split('-').map(Number) as [number, number, number];
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 1) return 'Less than a month ago';
  if (months < 12) return `${plural(months, 'month')} ago`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${plural(years, 'year')}${rest === 0 ? '' : `, ${plural(rest, 'month')}`} ago`;
}
