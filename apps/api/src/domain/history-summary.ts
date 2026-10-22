import { selectCurrentRow } from './current-salary';
import { BASE_CURRENCY, convert, type FxRates } from './fx';
import { historyChangeBp } from './history-change';
import { percentChangeBpOrNull } from './revision';

export interface HistorySummaryRow<R extends string = string> {
  id: number;
  effectiveDate: string;
  amountMinor: number;
  currencyCode: string;
  reason: R;
}

export interface HistorySummaryFigures<R extends string = string> {
  /** The rows' currency, or USD when they span more than one. */
  currencyCode: string;
  convertedToUsd: boolean;
  /** First row (by date, then id), in `currencyCode`. */
  hireAmountMinor: number;
  /** Current row, in `currencyCode`. */
  currentAmountMinor: number;
  sinceHireBp: number | null;
  averageYearlyGrowthBp: number | null;
  biggestJump: { historyId: number; changeBp: number; effectiveDate: string; reason: R } | null;
  promotionCount: number;
  raiseCount: number;
}

const DAY_MS = 86_400_000;
const DAYS_PER_YEAR = 365.25;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Summarises a salary history: change since hire, compound yearly growth up to `endDate`, the
 * largest single increase and the counts of promotions and raises. Rows in one currency are
 * compared in it; rows spanning several currencies are compared in USD at the given rates.
 */
export function summariseHistory<R extends string>(
  rows: HistorySummaryRow<R>[],
  rates: FxRates,
  endDate: string,
): HistorySummaryFigures<R> {
  const ordered = [...rows].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id - b.id,
  );
  const first = ordered[0];
  if (!first) throw new Error('Cannot summarise an empty history');
  const current = selectCurrentRow(ordered);

  const convertedToUsd = ordered.some((row) => row.currencyCode !== first.currencyCode);
  const currencyCode = convertedToUsd ? BASE_CURRENCY : first.currencyCode;
  const inFigures = (row: HistorySummaryRow<R>) =>
    convertedToUsd
      ? convert(row.amountMinor, row.currencyCode, BASE_CURRENCY, rates)
      : row.amountMinor;
  const hireAmountMinor = inFigures(first);
  const currentAmountMinor = inFigures(current);

  const hasChanges = ordered.length >= 2;
  const sinceHireBp = hasChanges
    ? percentChangeBpOrNull(hireAmountMinor, currentAmountMinor)
    : null;

  const days = daysBetween(first.effectiveDate, endDate);
  const averageYearlyGrowthBp =
    hasChanges && hireAmountMinor > 0 && days >= 365
      ? roundHalfAwayFromZero(
          ((currentAmountMinor / hireAmountMinor) ** (DAYS_PER_YEAR / days) - 1) * 10_000,
        )
      : null;

  const changes = historyChangeBp(ordered, rates);
  let biggestJump: HistorySummaryFigures<R>['biggestJump'] = null;
  for (const row of ordered) {
    const changeBp = changes.get(row.id) ?? null;
    if (
      changeBp !== null &&
      changeBp > 0 &&
      (biggestJump === null || changeBp > biggestJump.changeBp)
    ) {
      biggestJump = {
        historyId: row.id,
        changeBp,
        effectiveDate: row.effectiveDate,
        reason: row.reason,
      };
    }
  }

  return {
    currencyCode,
    convertedToUsd,
    hireAmountMinor,
    currentAmountMinor,
    sinceHireBp,
    averageYearlyGrowthBp,
    biggestJump,
    promotionCount: ordered.filter((row) => row.reason === 'promotion').length,
    raiseCount: ordered.filter((row) => row.reason === 'raise').length,
  };
}
