const CURRENCY_EXPONENTS: Record<string, number> = {
  USD: 2,
  INR: 2,
  EUR: 2,
};

export function currencyExponent(currencyCode: string): number {
  const exponent = CURRENCY_EXPONENTS[currencyCode];
  if (exponent === undefined) throw new Error(`Unsupported currency: ${currencyCode}`);
  return exponent;
}

/** Integer division rounding half away from zero, exact for any size. */
export function divideRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (2n * n + d) / (2n * d);
  return negative ? -quotient : quotient;
}

/** Formats integer minor units as a decimal string (`12345678` -> `123456.78`), never via a float. */
export function formatMinor(amountMinor: number, currencyCode: string): string {
  const exponent = currencyExponent(currencyCode);
  const negative = amountMinor < 0;
  const digits = Math.abs(amountMinor)
    .toString()
    .padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
