import { describe, expect, it } from 'vitest';
import {
  formatChangeBp,
  formatInputAmount,
  formatMoney,
  formatPercentageBp,
  formatSignedMoney,
  parseMajorToMinor,
  parsePercentageToBp,
} from './money';

describe('formatMoney', () => {
  it('formats US dollars from integer cents', () => {
    expect(formatMoney(9_000_000, 'USD')).toBe('$90,000.00');
  });

  it('groups Indian rupees in lakhs', () => {
    expect(formatMoney(500_000_000, 'INR')).toBe('₹50,00,000.00');
  });

  it('formats euros from integer cents', () => {
    expect(formatMoney(123_456, 'EUR')).toContain('1.234,56');
  });

  it('keeps every digit of an amount too large for a float to hold exactly', () => {
    expect(formatMoney(9_007_199_254_740_993n, 'USD')).toBe('$90,071,992,547,409.93');
  });

  it('can drop the fraction for compact table cells', () => {
    expect(formatMoney(9_000_050, 'USD', { fraction: false })).toBe('$90,001');
  });
});

describe('parseMajorToMinor', () => {
  it('turns a typed amount into integer minor units', () => {
    expect(parseMajorToMinor('1,234.5', 'USD')).toBe(123_450);
  });

  it('accepts a whole number', () => {
    expect(parseMajorToMinor('90000', 'USD')).toBe(9_000_000);
  });

  it('rejects text, negatives, and more decimals than the currency has', () => {
    expect(parseMajorToMinor('abc', 'USD')).toBeNull();
    expect(parseMajorToMinor('-5', 'USD')).toBeNull();
    expect(parseMajorToMinor('1.234', 'USD')).toBeNull();
    expect(parseMajorToMinor('', 'USD')).toBeNull();
  });
});

describe('percentages in basis points', () => {
  it('turns a typed percentage into basis points without float math', () => {
    expect(parsePercentageToBp('7')).toBe(700);
    expect(parsePercentageToBp('7.25')).toBe(725);
    expect(parsePercentageToBp('0.1')).toBe(10);
  });

  it('rejects zero, over one hundred percent, and extra precision', () => {
    expect(parsePercentageToBp('0')).toBeNull();
    expect(parsePercentageToBp('100.01')).toBeNull();
    expect(parsePercentageToBp('1.234')).toBeNull();
    expect(parsePercentageToBp('x')).toBeNull();
  });

  it('formats basis points back as a percentage', () => {
    expect(formatPercentageBp(700)).toBe('7%');
    expect(formatPercentageBp(725)).toBe('7.25%');
    expect(formatPercentageBp(50)).toBe('0.5%');
  });
});

describe('signed changes', () => {
  it('formats a percentage change with its sign', () => {
    expect([formatChangeBp(1111), formatChangeBp(-250), formatChangeBp(0)]).toEqual([
      '+11.11%',
      '-2.5%',
      '0%',
    ]);
  });

  it('formats a money change with its sign', () => {
    expect(formatSignedMoney(50_000_000, 'INR')).toBe('+₹5,00,000.00');
    expect(formatSignedMoney(-100_000, 'USD')).toBe('-$1,000.00');
    expect(formatSignedMoney(0, 'INR')).toBe('₹0.00');
  });

  it('formats a money change compactly with its sign for a chart label', () => {
    expect(formatSignedMoney(1_520_000_000, 'USD', { compact: true })).toBe('+$15.2M');
    expect(formatSignedMoney(-130_000_000, 'USD', { compact: true })).toBe('-$1.3M');
    expect(formatSignedMoney(0, 'USD', { compact: true })).toBe('$0');
  });
});

describe('formatInputAmount', () => {
  it('formats an amount for an input with digit grouping that it can read back', () => {
    expect(formatInputAmount(198_218_262, 'USD')).toBe('1,982,182.62');
    expect(formatInputAmount(198_218_262, 'INR')).toBe('19,82,182.62');
    expect(formatInputAmount(198_218_262, 'EUR')).toBe('1,982,182.62');
    expect(formatInputAmount(5, 'USD')).toBe('0.05');
    expect(parseMajorToMinor('19,82,182.62', 'INR')).toBe(198_218_262);
  });
});
