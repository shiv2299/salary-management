import { currencyExponent, divideRoundHalfAwayFromZero } from './money';

export const BASE_CURRENCY = 'USD';

const NANO = 1_000_000_000;

/** Value of one major unit of each currency in USD, multiplied by 10^9. USD itself is implicit. */
export type FxRates = Record<string, number>;

function rateNano(currencyCode: string, rates: FxRates): bigint {
  if (currencyCode === BASE_CURRENCY) return BigInt(NANO);
  const rate = rates[currencyCode];
  if (rate === undefined) throw new Error(`No FX rate for currency: ${currencyCode}`);
  return BigInt(rate);
}

/**
 * Converts integer minor units between currencies in one calculation, rounding once at the end
 * (half away from zero). The 10^9 rate scale cancels, so only the minor-unit exponents remain.
 */
export function convert(amountMinor: number, from: string, to: string, rates: FxRates): number {
  if (from === to) return amountMinor;
  const numerator =
    BigInt(amountMinor) * rateNano(from, rates) * 10n ** BigInt(currencyExponent(to));
  const denominator = rateNano(to, rates) * 10n ** BigInt(currencyExponent(from));
  return Number(divideRoundHalfAwayFromZero(numerator, denominator));
}
