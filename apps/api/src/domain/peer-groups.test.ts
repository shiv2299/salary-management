import { describe, expect, it } from 'vitest';
import { peerGroupKey, peerPosition, summarisePeerGroup } from './peer-groups';

const members = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    amountMinor: (i + 1) * 1000,
    currencyCode: 'INR',
    amountBaseMinor: (i + 1) * 2000,
  }));

describe('peerGroupKey', () => {
  it('joins the country code and the level id', () => {
    expect(peerGroupKey('IN', 3)).toBe('IN:3');
  });
});

describe('summarisePeerGroup', () => {
  it('returns no summary for a group smaller than the minimum peer group size', () => {
    expect(summarisePeerGroup(members(9), 'INR')).toBeNull();
    expect(summarisePeerGroup(members(10), 'INR')).not.toBeNull();
  });

  it('gives the typical range and median in local currency and the fences in USD', () => {
    const s = summarisePeerGroup(members(10), 'INR')!;
    expect(s.typical).toEqual({ p25: 3250, median: 5500, p75: 7750 });
    expect(s.fences).toEqual({ lower: -7000, upper: 29000 });
    expect(s.headcount).toBe(10);
  });

  it('leaves members paid in another currency out of the local figures but not out of the USD fences', () => {
    const s = summarisePeerGroup(
      [...members(10), { amountMinor: 1, currencyCode: 'EUR', amountBaseMinor: 22000 }],
      'INR',
    )!;
    expect(s.typical.p25).toBe(3250);
    expect(s.headcount).toBe(11);
    expect(s.base.headcount).toBe(11);
  });

  it('returns no summary when nobody in the group is paid in the group currency', () => {
    expect(summarisePeerGroup(members(10), 'EUR')).toBeNull();
  });
});

describe('peerPosition', () => {
  it('places an amount inside the typical range when it lies on or between the quartiles', () => {
    const s = summarisePeerGroup(members(10), 'INR')!;
    expect(peerPosition({ amountMinor: 3250, amountBaseMinor: 6500 }, s)).toEqual({
      typical: 'inside',
      outlier: null,
    });
    expect(peerPosition({ amountMinor: 7750, amountBaseMinor: 15500 }, s).typical).toBe('inside');
    expect(peerPosition({ amountMinor: 8000, amountBaseMinor: 16000 }, s)).toEqual({
      typical: 'above',
      outlier: null,
    });
    expect(peerPosition({ amountMinor: 3000, amountBaseMinor: 6000 }, s).typical).toBe('below');
  });

  it('flags an outlier only beyond the USD fences', () => {
    const s = summarisePeerGroup(members(10), 'INR')!;
    expect(peerPosition({ amountMinor: 20000, amountBaseMinor: 29000 }, s).outlier).toBeNull();
    expect(peerPosition({ amountMinor: 20000, amountBaseMinor: 29001 }, s).outlier).toBe('above');
    expect(peerPosition({ amountMinor: 1, amountBaseMinor: -7001 }, s).outlier).toBe('below');
  });
});
