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
