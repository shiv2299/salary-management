import { divideRoundHalfAwayFromZero } from './money';

/** Minimum active employees in a peer group before outlier fences are evaluated. */
export const MIN_PEER_GROUP_SIZE = 10;

export interface Distribution {
  headcount: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
}

export interface OutlierFences {
  lower: number;
  upper: number;
}

function valueAt(sorted: number[], index: number): number {
  const value = sorted[index];
  if (value === undefined) throw new Error(`Index ${index} is outside the sorted amounts`);
  return value;
}

/**
 * Linear interpolation between nearest ranks, matching Excel PERCENTILE.INC.
 * `percent` is an integer percentage (25, 50, 75, 90) so the position is computed exactly.
 * The interpolated value is rounded half away from zero, once.
 */
function percentileOfSorted(sorted: number[], percent: number): number {
  const last = sorted.length - 1;
  const span = percent * last;
  const lower = Math.floor(span / 100);
  const remainder = span - lower * 100;
  const upper = Math.min(lower + 1, last);
  const lowerValue = valueAt(sorted, lower);
  const upperValue = valueAt(sorted, upper);
  const numerator = BigInt(lowerValue) * 100n + BigInt(upperValue - lowerValue) * BigInt(remainder);
  return Number(divideRoundHalfAwayFromZero(numerator, 100n));
}

/**
 * Summarises a set of integer minor-unit amounts. Does not mutate the input.
 * Throws on an empty set, since no distribution is meaningful without values.
 */
export function computeDistribution(amountsMinor: number[]): Distribution {
  if (amountsMinor.length === 0) {
    throw new Error('Cannot compute a distribution from an empty set');
  }

  const sorted = amountsMinor.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((total, amount) => total + BigInt(amount), 0n);
  const mean = divideRoundHalfAwayFromZero(sum, BigInt(sorted.length));

  return {
    headcount: sorted.length,
    min: valueAt(sorted, 0),
    max: valueAt(sorted, sorted.length - 1),
    mean: Number(mean),
    median: percentileOfSorted(sorted, 50),
    p25: percentileOfSorted(sorted, 25),
    p75: percentileOfSorted(sorted, 75),
    p90: percentileOfSorted(sorted, 90),
  };
}

/** Tukey's fences: 1.5 interquartile ranges beyond the quartiles. Not rounded. */
export function outlierFences(dist: { p25: number; p75: number }): OutlierFences {
  const iqr = dist.p75 - dist.p25;
  return {
    lower: dist.p25 - 1.5 * iqr,
    upper: dist.p75 + 1.5 * iqr,
  };
}

/** True only when the amount lies strictly outside the fences. */
export function isOutlier(amountMinor: number, fences: OutlierFences): boolean {
  return amountMinor < fences.lower || amountMinor > fences.upper;
}
