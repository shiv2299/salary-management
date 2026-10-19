import { describe, expect, it } from 'vitest';
import { convert, type FxRates } from './fx';

const rates: FxRates = {
  INR: 11_980_000, // 1 INR = 0.01198 USD
  EUR: 1_080_000_000, // 1 EUR = 1.08 USD
};

describe('convert', () => {
  it('returns the amount unchanged when the currencies match', () => {
    expect(convert(123_456, 'INR', 'INR', rates)).toBe(123_456);
  });

  it('converts a local amount to USD', () => {
    // 5,000,000.00 INR * 0.01198 = 59,900.00 USD
    expect(convert(500_000_000, 'INR', 'USD', rates)).toBe(5_990_000);
  });

  it('converts USD to a local currency', () => {
    // 59,900.00 USD / 0.01198 = 5,000,000.00 INR
    expect(convert(5_990_000, 'USD', 'INR', rates)).toBe(500_000_000);
  });

  it('converts between two non-USD currencies in one step', () => {
    // 1,000.00 EUR = 1,080.00 USD = 90,150.25 INR (1080 / 0.01198 = 90150.2504...)
    expect(convert(100_000, 'EUR', 'INR', rates)).toBe(9_015_025);
  });

  it('rounds half away from zero once at the end', () => {
    // 0.05 INR * 0.01198 = 0.000599 USD -> 0.06 cents -> rounds to 0
    expect(convert(5, 'INR', 'USD', rates)).toBe(0);
    // 0.50 INR * 0.01198 USD = 0.00599 USD = 0.599 cents -> 1
    expect(convert(50, 'INR', 'USD', rates)).toBe(1);
    // an exact half: 1 INR at 0.005 USD = 0.5 cents -> 1
    expect(convert(100, 'INR', 'USD', { INR: 5_000_000 })).toBe(1);
  });

  it('keeps full precision when the intermediate product exceeds the safe float range', () => {
    // 8e15 * 1.08e9 is ~8.6e24 mid-calculation; the result still fits a safe integer
    expect(convert(8_000_000_000_000_000, 'EUR', 'USD', rates)).toBe(8_640_000_000_000_000);
  });

  it('rejects a currency with no rate', () => {
    expect(() => convert(100, 'GBP', 'USD', rates)).toThrow('No FX rate for currency: GBP');
  });
});
