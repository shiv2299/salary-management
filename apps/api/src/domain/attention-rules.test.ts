import { describe, expect, it } from 'vitest';
import { compressionGroups, hasNoRecentIncrease, type CompressionMember } from './attention-rules';

const TODAY = '2026-01-15';

describe('hasNoRecentIncrease', () => {
  it('flags a last increase more than 24 months ago', () => {
    expect(
      hasNoRecentIncrease({ hireDate: '2015-01-01', lastIncreaseOn: '2024-01-14' }, TODAY),
    ).toBe(true);
  });

  it('does not flag a last increase exactly 24 months ago', () => {
    expect(
      hasNoRecentIncrease({ hireDate: '2015-01-01', lastIncreaseOn: '2024-01-15' }, TODAY),
    ).toBe(false);
  });

  it('falls back to the hire date when there was never an increase', () => {
    expect(hasNoRecentIncrease({ hireDate: '2024-01-14', lastIncreaseOn: null }, TODAY)).toBe(true);
    expect(hasNoRecentIncrease({ hireDate: '2024-01-15', lastIncreaseOn: null }, TODAY)).toBe(
      false,
    );
  });

  it('does not flag a recent increase after an old hire', () => {
    expect(
      hasNoRecentIncrease({ hireDate: '2015-01-01', lastIncreaseOn: '2025-06-01' }, TODAY),
    ).toBe(false);
  });
});

let nextId = 1;
function members(
  count: number,
  hireDate: string,
  amountBaseMinor: number,
  overrides: Partial<CompressionMember> = {},
): CompressionMember[] {
  return Array.from({ length: count }, () => ({
    employeeId: nextId++,
    countryCode: 'IN',
    levelId: 2,
    hireDate,
    amountBaseMinor,
    ...overrides,
  }));
}

describe('compressionGroups', () => {
  it("flags a group whose recent hires' median is more than 5% above its long-tenured median", () => {
    nextId = 1;
    const recent = members(5, '2025-06-01', 10_600_000);
    const tenured = members(5, '2023-01-15', 10_000_000);
    const between = members(1, '2024-06-01', 50_000_000);

    const result = compressionGroups([...recent, ...tenured, ...between], TODAY);

    expect(result).toEqual([
      {
        countryCode: 'IN',
        levelId: 2,
        recentCount: 5,
        tenuredCount: 5,
        recentMedianBaseMinor: 10_600_000,
        tenuredMedianBaseMinor: 10_000_000,
        gapBp: 600,
        paidLessEmployeeIds: tenured.map((m) => m.employeeId),
      },
    ]);
  });

  it("lists only the long-tenured staff paid less than the recent hires' median", () => {
    const recent = members(5, '2025-06-01', 12_000_000);
    const below = members(3, '2023-01-15', 10_000_000);
    const atMedian = members(1, '2023-01-15', 12_000_000);
    const above = members(1, '2023-01-15', 13_000_000);

    const [group] = compressionGroups([...recent, ...below, ...atMedian, ...above], TODAY);

    expect(group).toMatchObject({ tenuredCount: 5, tenuredMedianBaseMinor: 10_000_000 });
    expect(group!.paidLessEmployeeIds).toEqual(below.map((m) => m.employeeId));
  });

  it('does not flag a gap of exactly 5%', () => {
    const all = [...members(5, '2025-06-01', 10_500_000), ...members(5, '2023-01-15', 10_000_000)];

    expect(compressionGroups(all, TODAY)).toEqual([]);
  });

  it('does not evaluate a group with fewer than 5 recent hires', () => {
    const all = [...members(4, '2025-06-01', 20_000_000), ...members(5, '2023-01-15', 10_000_000)];

    expect(compressionGroups(all, TODAY)).toEqual([]);
  });

  it('treats the boundaries as recent after a year ago and tenured on or before three years ago', () => {
    const notRecent = members(5, '2025-01-15', 20_000_000);
    const recent = members(5, '2025-01-16', 20_000_000);
    const tenured = members(5, '2023-01-15', 10_000_000);
    const notTenured = members(5, '2023-01-16', 10_000_000);

    expect(compressionGroups([...notRecent, ...tenured, ...notTenured], TODAY)).toEqual([]);
    expect(compressionGroups([...recent, ...notTenured], TODAY)).toEqual([]);
    const [group] = compressionGroups([...recent, ...notRecent, ...tenured, ...notTenured], TODAY);
    expect(group).toMatchObject({ recentCount: 5, tenuredCount: 5 });
  });

  it('orders flagged groups by gap, largest first', () => {
    const small = [
      ...members(5, '2025-06-01', 11_000_000, { countryCode: 'US', levelId: 1 }),
      ...members(5, '2023-01-15', 10_000_000, { countryCode: 'US', levelId: 1 }),
    ];
    const large = [
      ...members(5, '2025-06-01', 13_000_000),
      ...members(5, '2023-01-15', 10_000_000),
    ];

    const result = compressionGroups([...small, ...large], TODAY);

    expect(result.map((g) => [g.countryCode, g.gapBp])).toEqual([
      ['IN', 3000],
      ['US', 1000],
    ]);
  });
});
