import { BASE_CURRENCY, convert, type FxRates } from './fx';
import { percentChangeBpOrNull } from './revision';

export interface HistoryChangeRow {
  id: number;
  effectiveDate: string;
  amountMinor: number;
  currencyCode: string;
}

/**
 * The percentage change of each history row from the row before it by effective date (ties by
 * id), in basis points. The first row has none. Rows in the same currency are compared in that
 * currency; across a change of currency both amounts are compared in USD at the given rates. A row
 * whose previous amount is zero in USD (a tiny salary rounded down) has no percentage either.
 */
export function historyChangeBp(
  rows: HistoryChangeRow[],
  rates: FxRates,
): Map<number, number | null> {
  const ordered = [...rows].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id - b.id,
  );
  const result = new Map<number, number | null>();
  ordered.forEach((row, index) => {
    const previous = ordered[index - 1];
    if (!previous) {
      result.set(row.id, null);
    } else if (previous.currencyCode === row.currencyCode) {
      result.set(row.id, percentChangeBpOrNull(previous.amountMinor, row.amountMinor));
    } else {
      result.set(
        row.id,
        percentChangeBpOrNull(
          convert(previous.amountMinor, previous.currencyCode, BASE_CURRENCY, rates),
          convert(row.amountMinor, row.currencyCode, BASE_CURRENCY, rates),
        ),
      );
    }
  });
  return result;
}
