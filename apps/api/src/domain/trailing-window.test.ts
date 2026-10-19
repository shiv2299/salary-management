import { describe, expect, it } from 'vitest';
import { trailingWindowStart } from './trailing-window';

describe('trailingWindowStart', () => {
  it('goes back the given number of whole years from today', () => {
    expect(trailingWindowStart('2026-10-19', 3)).toBe('2023-10-19');
    expect(trailingWindowStart('2026-10-19', 5)).toBe('2021-10-19');
  });

  it('uses the last day of February when today is 29 February and the earlier year has none', () => {
    expect(trailingWindowStart('2028-02-29', 3)).toBe('2025-02-28');
  });

  it('keeps 29 February when the earlier year is also a leap year', () => {
    expect(trailingWindowStart('2028-02-29', 4)).toBe('2024-02-29');
  });
});
