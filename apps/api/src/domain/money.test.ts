import { describe, expect, it } from 'vitest';
import { currencyExponent, divideRoundHalfAwayFromZero, formatMinor } from './money';

describe('currencyExponent', () => {
  it('returns 2 minor digits for the supported currencies', () => {
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('INR')).toBe(2);
    expect(currencyExponent('EUR')).toBe(2);
  });

  it('rejects a currency it does not know', () => {
    expect(() => currencyExponent('XYZ')).toThrow('Unsupported currency: XYZ');
  });
});

describe('divideRoundHalfAwayFromZero', () => {
  it('returns exact quotients unchanged', () => {
    expect(divideRoundHalfAwayFromZero(10n, 5n)).toBe(2n);
  });

  it('rounds below one half down', () => {
    expect(divideRoundHalfAwayFromZero(14n, 10n)).toBe(1n);
  });

  it('rounds exactly one half up for positive values', () => {
    expect(divideRoundHalfAwayFromZero(15n, 10n)).toBe(2n);
  });

  it('rounds exactly one half away from zero for negative values', () => {
    expect(divideRoundHalfAwayFromZero(-15n, 10n)).toBe(-2n);
  });

  it('rounds below one half toward zero for negative values', () => {
    expect(divideRoundHalfAwayFromZero(-14n, 10n)).toBe(-1n);
  });

  it('handles a negative divisor', () => {
    expect(divideRoundHalfAwayFromZero(15n, -10n)).toBe(-2n);
  });

  it('rejects division by zero', () => {
    expect(() => divideRoundHalfAwayFromZero(1n, 0n)).toThrow('Division by zero');
  });
});

describe('formatMinor', () => {
  it('formats minor units as a decimal string', () => {
    expect(formatMinor(12345678, 'USD')).toBe('123456.78');
  });

  it('pads the fractional part', () => {
    expect(formatMinor(5, 'USD')).toBe('0.05');
    expect(formatMinor(1000, 'USD')).toBe('10.00');
  });

  it('formats negative amounts', () => {
    expect(formatMinor(-250, 'EUR')).toBe('-2.50');
  });
});
