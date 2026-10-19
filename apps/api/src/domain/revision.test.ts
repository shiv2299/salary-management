import { describe, expect, it } from 'vitest';
import { proposedAmount } from './revision';

describe('proposedAmount', () => {
  it('applies a 7% increase to a whole amount', () => {
    expect(proposedAmount(100000, 700)).toBe(107000);
  });

  it('rounds an exact half up, away from zero', () => {
    expect(proposedAmount(50, 100)).toBe(51);
  });

  it('rounds below one half down', () => {
    expect(proposedAmount(50, 99)).toBe(50);
  });

  it('doubles the amount for a 100% increase', () => {
    expect(proposedAmount(123456, 10000)).toBe(246912);
  });

  it('applies a 1 basis point increase exactly', () => {
    expect(proposedAmount(100000, 1)).toBe(100010);
  });

  it('keeps a very large amount exact', () => {
    expect(proposedAmount(8e15, 700)).toBe(8.56e15);
  });

  it('rejects a zero percentage', () => {
    expect(() => proposedAmount(100000, 0)).toThrow(
      'percentageBp must be an integer from 1 to 10000',
    );
  });

  it('rejects a percentage above 10000 basis points', () => {
    expect(() => proposedAmount(100000, 10001)).toThrow(
      'percentageBp must be an integer from 1 to 10000',
    );
  });

  it('rejects a fractional percentage', () => {
    expect(() => proposedAmount(100000, 1.5)).toThrow(
      'percentageBp must be an integer from 1 to 10000',
    );
  });
});
