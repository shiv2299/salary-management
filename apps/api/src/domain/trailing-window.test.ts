import { describe, expect, it } from 'vitest';
import {
  isWithin,
  previousTrailingYear,
  trailingWindowStart,
  trailingYear,
} from './trailing-window';

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

describe('trailingYear', () => {
  it('gives the last 12 months as the dates after a year ago through today', () => {
    expect(trailingYear('2026-01-15')).toEqual({ after: '2025-01-15', through: '2026-01-15' });
  });

  it('moves a 29 February start to 28 February', () => {
    expect(trailingYear('2024-02-29').after).toBe('2023-02-28');
  });
});

describe('previousTrailingYear', () => {
  it('gives the 12 months before that', () => {
    expect(previousTrailingYear('2026-01-15')).toEqual({
      after: '2024-01-15',
      through: '2025-01-15',
    });
  });
});

describe('isWithin', () => {
  it('excludes the start and includes the end', () => {
    const window = trailingYear('2026-01-15');
    expect(isWithin('2025-01-15', window)).toBe(false);
    expect(isWithin('2025-01-16', window)).toBe(true);
    expect(isWithin('2026-01-15', window)).toBe(true);
  });
});
