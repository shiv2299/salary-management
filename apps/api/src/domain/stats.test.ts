import { describe, expect, it } from 'vitest';
import { computeDistribution, isOutlier, MIN_PEER_GROUP_SIZE, outlierFences } from './stats';

describe('computeDistribution', () => {
  it('computes headcount, min, max, mean, median and percentiles for an odd-length set', () => {
    expect(computeDistribution([10, 20, 30, 40, 50])).toEqual({
      headcount: 5,
      min: 10,
      max: 50,
      mean: 30,
      median: 30,
      p25: 20,
      p75: 40,
      p90: 46,
    });
  });

  it('interpolates the median between the two middle values for an even-length set', () => {
    const distribution = computeDistribution([10, 20, 30, 40]);
    expect(distribution.median).toBe(25);
    expect(distribution.mean).toBe(25);
  });

  it('interpolates p25 and p75 between nearest ranks and rounds the result half up', () => {
    // p25 position 0.75 -> 10 + 0.75 * 10 = 17.5 -> 18
    // p75 position 2.25 -> 30 + 0.25 * 10 = 32.5 -> 33
    const distribution = computeDistribution([10, 20, 30, 40]);
    expect(distribution.p25).toBe(18);
    expect(distribution.p75).toBe(33);
  });

  it('returns the single value for every statistic when there is one element', () => {
    expect(computeDistribution([700])).toEqual({
      headcount: 1,
      min: 700,
      max: 700,
      mean: 700,
      median: 700,
      p25: 700,
      p75: 700,
      p90: 700,
    });
  });

  it('rounds an exactly half mean up', () => {
    expect(computeDistribution([1, 2]).mean).toBe(2);
  });

  it('rounds a mean below one half down', () => {
    expect(computeDistribution([1, 1, 2]).mean).toBe(1);
  });

  it('sorts unsorted input before computing order statistics', () => {
    const distribution = computeDistribution([50, 10, 40, 20, 30]);
    expect(distribution.min).toBe(10);
    expect(distribution.max).toBe(50);
    expect(distribution.p25).toBe(20);
    expect(distribution.p90).toBe(46);
  });

  it('does not mutate the input array', () => {
    const amounts = [50, 10, 40, 20, 30];
    computeDistribution(amounts);
    expect(amounts).toEqual([50, 10, 40, 20, 30]);
  });

  it('returns only integers', () => {
    const distribution = computeDistribution([1, 2, 3, 4, 10]);
    for (const value of Object.values(distribution)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('rejects an empty set with a clear error', () => {
    expect(() => computeDistribution([])).toThrow(
      'Cannot compute a distribution from an empty set',
    );
  });
});

describe('outlierFences', () => {
  it('places the fences 1.5 interquartile ranges beyond the quartiles', () => {
    // IQR = 40 - 20 = 20, so lower = 20 - 30 = -10 and upper = 40 + 30 = 70
    expect(outlierFences({ p25: 20, p75: 40 })).toEqual({ lower: -10, upper: 70 });
  });

  it('keeps a fractional fence rather than rounding it', () => {
    // IQR = 15 - 10 = 5, so 1.5 * IQR = 7.5
    expect(outlierFences({ p25: 10, p75: 15 })).toEqual({ lower: 2.5, upper: 22.5 });
  });
});

describe('isOutlier', () => {
  const fences = { lower: 10, upper: 50 };

  it('flags an amount strictly above the upper fence', () => {
    expect(isOutlier(51, fences)).toBe(true);
  });

  it('flags an amount strictly below the lower fence', () => {
    expect(isOutlier(9, fences)).toBe(true);
  });

  it('does not flag an amount exactly on the upper fence', () => {
    expect(isOutlier(50, fences)).toBe(false);
  });

  it('does not flag an amount exactly on the lower fence', () => {
    expect(isOutlier(10, fences)).toBe(false);
  });

  it('does not flag an amount inside the fences', () => {
    expect(isOutlier(30, fences)).toBe(false);
  });
});

describe('MIN_PEER_GROUP_SIZE', () => {
  it('is 10 so that peer groups smaller than ten are not evaluated', () => {
    expect(MIN_PEER_GROUP_SIZE).toBe(10);
  });
});
