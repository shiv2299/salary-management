import { describe, expect, it } from 'vitest';
import { levelBands } from './level-bands';

const levels = [
  { levelId: 1, levelCode: 'L1', rank: 1 },
  { levelId: 2, levelCode: 'L2', rank: 2 },
  { levelId: 3, levelCode: 'L3', rank: 3 },
];

function members(levelId: number, amounts: number[]) {
  return amounts.map((amountMinor) => ({
    levelId,
    amountMinor,
    currencyCode: 'INR',
    amountBaseMinor: amountMinor,
  }));
}

const l1 = members(1, [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 2500, 2600]);
const l2 = members(
  2,
  Array.from({ length: 10 }, (_, i) => 2000 + i * 100),
);
const l3 = members(3, [3000, 3100, 3200, 3300]);

describe('levelBands', () => {
  it('gives each level its typical range from the peer-group summary', () => {
    const { levels: result } = levelBands(levels, [...l1, ...l2, ...l3], 'INR');

    expect(result[0]!.typical).toEqual({ p25: 1225, median: 1450, p75: 1675 });
    expect(result[1]!.typical).toEqual({ p25: 2225, median: 2450, p75: 2675 });
  });

  it('computes the step from the level below', () => {
    const { levels: result } = levelBands(levels, [...l1, ...l2, ...l3], 'INR');

    expect(result[1]!.stepFromBelowBp).toBe(16897);
    expect(result[0]!.stepFromBelowBp).toBeNull();
  });

  it("counts people above the next level's median", () => {
    const { levels: result } = levelBands(levels, [...l1, ...l2, ...l3], 'INR');

    expect(result[0]).toMatchObject({ aboveNextMedianCount: 2, aboveNextMedianShareBp: 2000 });
    expect(result[1]).toMatchObject({
      aboveNextMedianCount: null,
      aboveNextMedianShareBp: null,
    });
  });

  it('leaves a level under ten people without a band or step', () => {
    const { levels: result } = levelBands(levels, [...l1, ...l2, ...l3], 'INR');

    expect(result[2]).toMatchObject({
      headcount: 4,
      typical: null,
      stepFromBelowBp: null,
      aboveNextMedianCount: null,
    });
  });

  it('summarises the step range, the largest overlap and the widest spread', () => {
    const { summary } = levelBands(levels, [...l1, ...l2, ...l3], 'INR');

    expect(summary.stepRange).toEqual({ minBp: 16897, maxBp: 16897 });
    expect(summary.largestOverlap).toEqual({
      levelCode: 'L1',
      nextLevelCode: 'L2',
      shareBp: 2000,
      count: 2,
    });
    expect(summary.widestSpread).toEqual({ levelCode: 'L1', spreadBp: 3103 });
  });

  it('has no summary figures when no level has a band', () => {
    const { summary } = levelBands(levels, l3, 'INR');

    expect(summary).toEqual({ stepRange: null, largestOverlap: null, widestSpread: null });
  });

  it('lists every level in rank order, empty ones at headcount 0', () => {
    const reversed = [...levels].reverse();

    const { levels: result } = levelBands(reversed, l1, 'INR');

    expect(result.map((l) => [l.levelCode, l.headcount])).toEqual([
      ['L1', 10],
      ['L2', 0],
      ['L3', 0],
    ]);
  });

  it('ignores members paid in another currency when counting people above the next median', () => {
    const abroad = [{ levelId: 1, amountMinor: 9999, currencyCode: 'USD', amountBaseMinor: 9999 }];

    const { levels: result } = levelBands(levels, [...l1, ...abroad, ...l2], 'INR');

    expect(result[0]).toMatchObject({
      headcount: 11,
      aboveNextMedianCount: 2,
      aboveNextMedianShareBp: 2000,
    });
  });
});
