import type { LevelBandsResponse } from '@acme/shared';
import { divideRoundHalfAwayFromZero } from './money';
import { summarisePeerGroup, type PeerMember } from './peer-groups';

type Band = { p25: number; median: number; p75: number };

/** round_half_away(numerator × 10,000 ÷ denominator), in basis points. */
function ratioBp(numerator: number, denominator: number): number {
  return Number(divideRoundHalfAwayFromZero(BigInt(numerator) * 10_000n, BigInt(denominator)));
}

/**
 * The typical range of every level in one country, in rank order, with the step from the level
 * below, how many people are paid above the next level's median, and a summary. Each band is the
 * level's peer-group summary, so it agrees with the range shown for an individual employee. A
 * step, overlap or spread is computed only when the bands it needs exist.
 */
export function levelBands(
  levels: { levelId: number; levelCode: string; rank: number }[],
  members: (PeerMember & { levelId: number })[],
  currencyCode: string,
): Omit<LevelBandsResponse, 'countryCode' | 'currencyCode'> {
  const ordered = [...levels].sort((a, b) => a.rank - b.rank);
  const perLevel = ordered.map((level) => {
    const group = members.filter((m) => m.levelId === level.levelId);
    return {
      level,
      headcount: group.length,
      local: group.filter((m) => m.currencyCode === currencyCode),
      band: summarisePeerGroup(group, currencyCode)?.typical ?? null,
    };
  });

  const rows = perLevel.map((current, index) => {
    const below = perLevel[index - 1]?.band ?? null;
    const nextBand: Band | null = perLevel[index + 1]?.band ?? null;
    const stepFromBelowBp =
      current.band && below ? ratioBp(current.band.median, below.median) : null;
    let aboveNextMedianCount: number | null = null;
    let aboveNextMedianShareBp: number | null = null;
    if (current.band && nextBand) {
      aboveNextMedianCount = current.local.filter((m) => m.amountMinor > nextBand.median).length;
      aboveNextMedianShareBp = ratioBp(aboveNextMedianCount, current.local.length);
    }
    return {
      levelId: current.level.levelId,
      levelCode: current.level.levelCode,
      headcount: current.headcount,
      typical: current.band,
      stepFromBelowBp,
      aboveNextMedianCount,
      aboveNextMedianShareBp,
    };
  });

  const steps = rows.flatMap((r) => (r.stepFromBelowBp === null ? [] : [r.stepFromBelowBp]));

  let largestOverlap: LevelBandsResponse['summary']['largestOverlap'] = null;
  let widestSpread: LevelBandsResponse['summary']['widestSpread'] = null;
  rows.forEach((row, index) => {
    if (
      row.aboveNextMedianShareBp !== null &&
      row.aboveNextMedianShareBp > 0 &&
      (!largestOverlap || row.aboveNextMedianShareBp > largestOverlap.shareBp)
    ) {
      largestOverlap = {
        levelCode: row.levelCode,
        nextLevelCode: rows[index + 1]!.levelCode,
        shareBp: row.aboveNextMedianShareBp,
        count: row.aboveNextMedianCount ?? 0,
      };
    }
    if (row.typical) {
      const spreadBp = ratioBp(row.typical.p75 - row.typical.p25, row.typical.median);
      if (!widestSpread || spreadBp > widestSpread.spreadBp) {
        widestSpread = { levelCode: row.levelCode, spreadBp };
      }
    }
  });

  return {
    levels: rows,
    summary: {
      stepRange: steps.length > 0 ? { minBp: Math.min(...steps), maxBp: Math.max(...steps) } : null,
      largestOverlap,
      widestSpread,
    },
  };
}
