import {
  MIN_PEER_GROUP_SIZE,
  computeDistribution,
  isOutlier,
  outlierFences,
  type Distribution,
  type OutlierFences,
} from './stats';

export interface PeerMember {
  amountMinor: number;
  currencyCode: string;
  amountBaseMinor: number;
}

export interface PeerGroupSummary {
  headcount: number;
  currencyCode: string;
  /** The middle half of the group's pay, in local minor units. */
  typical: { p25: number; median: number; p75: number };
  /** Every member's pay in USD. */
  base: Distribution;
  /** Tukey's fences over the USD pay. Exact, not rounded. */
  fences: OutlierFences;
}

export type PeerPosition = {
  typical: 'below' | 'inside' | 'above';
  outlier: 'below' | 'above' | null;
};

/** The key of a country and level peer group, e.g. `IN:3`. */
export function peerGroupKey(countryCode: string, levelId: number): string {
  return `${countryCode}:${levelId}`;
}

/**
 * Summarises the members of one country and level. Returns null when the group is too small to
 * judge, or when nobody in it is paid in `currencyCode` (so there is no local range to show).
 * The local range uses only members paid in `currencyCode`; the headcount, USD distribution and
 * fences use every member.
 */
export function summarisePeerGroup(
  members: PeerMember[],
  currencyCode: string,
): PeerGroupSummary | null {
  if (members.length < MIN_PEER_GROUP_SIZE) return null;
  const local = members.filter((m) => m.currencyCode === currencyCode);
  if (local.length === 0) return null;

  const localDistribution = computeDistribution(local.map((m) => m.amountMinor));
  const base = computeDistribution(members.map((m) => m.amountBaseMinor));
  return {
    headcount: members.length,
    currencyCode,
    typical: {
      p25: localDistribution.p25,
      median: localDistribution.median,
      p75: localDistribution.p75,
    },
    base,
    fences: outlierFences(base),
  };
}

/** Where an amount sits against the group: the typical range is inclusive of both quartiles. */
export function peerPosition(
  amount: { amountMinor: number; amountBaseMinor: number },
  summary: PeerGroupSummary,
): PeerPosition {
  const { p25, p75 } = summary.typical;
  const typical =
    amount.amountMinor < p25 ? 'below' : amount.amountMinor > p75 ? 'above' : 'inside';
  const outlier = isOutlier(amount.amountBaseMinor, summary.fences)
    ? amount.amountBaseMinor > summary.fences.upper
      ? 'above'
      : 'below'
    : null;
  return { typical, outlier };
}
