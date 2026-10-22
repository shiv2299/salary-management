import { BASE_CURRENCY, convert, type FxRates } from './fx';
import { computeDistribution } from './stats';

export interface BulkFigureRow {
  currencyCode: string;
  currentAmountMinor: number;
  currentAmountBaseMinor: number;
  newAmountMinor: number;
}

export interface BulkRevisionFigures {
  /** One entry per currency present, ordered by currency code. */
  addedByCurrency: { currencyCode: string; addedMinor: number }[];
  /** The sum of each currency's added pay converted to USD, rounded once per currency. */
  addedBaseMinor: number;
  /** Median pay before and after; null when there are no rows. */
  typical: { currencyCode: string; beforeMinor: number; afterMinor: number } | null;
}

function safeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new Error('Added pay is outside the safe integer range');
  }
  return result;
}

/**
 * Figures for a bulk revision: added pay summed exactly within each currency (then converted to
 * USD once per currency), and the median pay before and after. The median is in the local currency
 * when everyone shares one, otherwise in USD.
 */
export function bulkRevisionFigures(rows: BulkFigureRow[], rates: FxRates): BulkRevisionFigures {
  const addedByCode = new Map<string, bigint>();
  for (const row of rows) {
    const added = BigInt(row.newAmountMinor) - BigInt(row.currentAmountMinor);
    addedByCode.set(row.currencyCode, (addedByCode.get(row.currencyCode) ?? 0n) + added);
  }

  const addedByCurrency = [...addedByCode.keys()].sort().map((currencyCode) => ({
    currencyCode,
    addedMinor: safeNumber(addedByCode.get(currencyCode) ?? 0n),
  }));
  const addedBaseMinor = addedByCurrency.reduce(
    (total, { currencyCode, addedMinor }) =>
      total + convert(addedMinor, currencyCode, BASE_CURRENCY, rates),
    0,
  );

  const first = rows[0];
  if (first === undefined) return { addedByCurrency, addedBaseMinor, typical: null };

  const sharedCurrency = addedByCode.size === 1;
  const before = rows.map((r) =>
    sharedCurrency ? r.currentAmountMinor : r.currentAmountBaseMinor,
  );
  const after = rows.map((r) =>
    sharedCurrency
      ? r.newAmountMinor
      : convert(r.newAmountMinor, r.currencyCode, BASE_CURRENCY, rates),
  );
  return {
    addedByCurrency,
    addedBaseMinor,
    typical: {
      currencyCode: sharedCurrency ? first.currencyCode : BASE_CURRENCY,
      beforeMinor: computeDistribution(before).median,
      afterMinor: computeDistribution(after).median,
    },
  };
}
