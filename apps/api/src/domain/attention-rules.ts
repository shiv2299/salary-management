import { percentChangeBp } from './revision';
import { computeDistribution } from './stats';
import { trailingWindowStart } from './trailing-window';

/** No raise or promotion for this many years puts someone on the attention list. */
export const NO_RAISE_YEARS = 2;
/** Hired within this many years counts as a recent hire. */
export const RECENT_HIRE_YEARS = 1;
/** Hired at least this many years ago counts as long-tenured. */
export const LONG_TENURE_YEARS = 3;
/** Each of the recent and long-tenured sides needs this many people before a group is judged. */
export const COMPRESSION_MIN_SUBGROUP = 5;
/** Recent hires' median must exceed the long-tenured median by more than this, in basis points. */
export const COMPRESSION_MARGIN_BP = 500;

/**
 * True when the last raise or promotion (or, with none, the hire) is before
 * `trailingWindowStart(today, NO_RAISE_YEARS)`.
 */
export function hasNoRecentIncrease(
  person: { hireDate: string; lastIncreaseOn: string | null },
  today: string,
): boolean {
  return (person.lastIncreaseOn ?? person.hireDate) < trailingWindowStart(today, NO_RAISE_YEARS);
}

export interface CompressionMember {
  employeeId: number;
  countryCode: string;
  levelId: number;
  hireDate: string;
  amountBaseMinor: number;
}

export interface CompressionGroup {
  countryCode: string;
  levelId: number;
  recentCount: number;
  tenuredCount: number;
  recentMedianBaseMinor: number;
  tenuredMedianBaseMinor: number;
  gapBp: number;
  /** Ascending. */
  tenuredEmployeeIds: number[];
}

/**
 * Country and level groups where recent hires are paid more than long-tenured colleagues, by more
 * than `COMPRESSION_MARGIN_BP` at the median. Largest gap first, then country code, then level id.
 */
export function compressionGroups(members: CompressionMember[], today: string): CompressionGroup[] {
  const recentAfter = trailingWindowStart(today, RECENT_HIRE_YEARS);
  const tenuredThrough = trailingWindowStart(today, LONG_TENURE_YEARS);

  const byGroup = new Map<
    string,
    {
      countryCode: string;
      levelId: number;
      recent: CompressionMember[];
      tenured: CompressionMember[];
    }
  >();
  for (const member of members) {
    const isRecent = member.hireDate > recentAfter;
    const isTenured = member.hireDate <= tenuredThrough;
    if (!isRecent && !isTenured) continue;
    const key = `${member.countryCode}:${member.levelId}`;
    let group = byGroup.get(key);
    if (!group) {
      group = { countryCode: member.countryCode, levelId: member.levelId, recent: [], tenured: [] };
      byGroup.set(key, group);
    }
    (isRecent ? group.recent : group.tenured).push(member);
  }

  const flagged: CompressionGroup[] = [];
  for (const { countryCode, levelId, recent, tenured } of byGroup.values()) {
    if (recent.length < COMPRESSION_MIN_SUBGROUP || tenured.length < COMPRESSION_MIN_SUBGROUP) {
      continue;
    }
    const recentMedian = computeDistribution(recent.map((m) => m.amountBaseMinor)).median;
    const tenuredMedian = computeDistribution(tenured.map((m) => m.amountBaseMinor)).median;
    if (tenuredMedian <= 0) continue;
    const exceedsMargin =
      BigInt(recentMedian) * 10_000n >
      BigInt(tenuredMedian) * BigInt(10_000 + COMPRESSION_MARGIN_BP);
    if (!exceedsMargin) continue;
    flagged.push({
      countryCode,
      levelId,
      recentCount: recent.length,
      tenuredCount: tenured.length,
      recentMedianBaseMinor: recentMedian,
      tenuredMedianBaseMinor: tenuredMedian,
      gapBp: percentChangeBp(tenuredMedian, recentMedian),
      tenuredEmployeeIds: tenured.map((m) => m.employeeId).sort((a, b) => a - b),
    });
  }
  return flagged.sort(
    (a, b) =>
      b.gapBp - a.gapBp || a.countryCode.localeCompare(b.countryCode) || a.levelId - b.levelId,
  );
}
