import { divideRoundHalfAwayFromZero } from './money';

const BASIS_POINTS_PER_WHOLE = 10000n;

/**
 * Proposed amount for a bulk percentage revision:
 * round_half_away_from_zero(current * (10000 + bp) / 10000), in integer arithmetic.
 */
export function proposedAmount(currentMinor: number, percentageBp: number): number {
  if (!Number.isInteger(percentageBp) || percentageBp < 1 || percentageBp > 10000) {
    throw new Error('percentageBp must be an integer from 1 to 10000');
  }
  const scaled = BigInt(currentMinor) * (BASIS_POINTS_PER_WHOLE + BigInt(percentageBp));
  const result = Number(divideRoundHalfAwayFromZero(scaled, BASIS_POINTS_PER_WHOLE));
  if (!Number.isSafeInteger(result)) {
    throw new Error('Proposed amount is outside the safe integer range');
  }
  return result;
}

/**
 * Percentage change from one amount to another in basis points:
 * round_half_away_from_zero((to - from) * 10000 / from), in integer arithmetic.
 */
export function percentChangeBp(fromMinor: number, toMinor: number): number {
  if (fromMinor <= 0) throw new Error('Cannot compare against a zero or negative amount');
  const scaled = (BigInt(toMinor) - BigInt(fromMinor)) * BASIS_POINTS_PER_WHOLE;
  return Number(divideRoundHalfAwayFromZero(scaled, BigInt(fromMinor)));
}

/**
 * Like `percentChangeBp`, but `null` when there is no meaningful starting amount: a USD-converted
 * amount can round down to zero for a very small salary, and a percentage of nothing is undefined.
 */
export function percentChangeBpOrNull(fromMinor: number, toMinor: number): number | null {
  return fromMinor <= 0 ? null : percentChangeBp(fromMinor, toMinor);
}
