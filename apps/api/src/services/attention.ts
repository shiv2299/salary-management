import type { Attention, AttentionResponse } from '@acme/shared';
import type { DbHandle } from '../db/client';
import { compressionGroups, hasNoRecentIncrease } from '../domain/attention-rules';
import { peerGroupKey, peerPosition } from '../domain/peer-groups';
import { divideRoundHalfAwayFromZero } from '../domain/money';
import { listCountries } from '../repositories/countries';
import { listActiveEmployeeRows } from '../repositories/employees';
import { listLevels } from '../repositories/levels';
import { listLastIncreaseDates } from '../repositories/salary-history';
import { getPeerGroups } from './peer-groups';

/** Active employee ids, ascending, for each "needs attention" value. */
export type AttentionSets = Record<Attention, number[]>;

interface AttentionFindings {
  activeHeadcount: number;
  sets: AttentionSets;
  compression: ReturnType<typeof compressionGroups>;
}

function findAttention(db: DbHandle, today: string): AttentionFindings {
  const rows = listActiveEmployeeRows(db).sort((a, b) => a.id - b.id);
  const peerGroups = getPeerGroups(db);
  const lastIncrease = new Map(
    listLastIncreaseDates(db).map((r) => [r.employeeId, r.lastIncreaseOn]),
  );

  const sets: AttentionSets = {
    'outlier-above': [],
    'outlier-below': [],
    'no-raise-2y': [],
    compression: [],
  };
  for (const row of rows) {
    const summary = peerGroups.get(peerGroupKey(row.countryCode, row.levelId))?.summary;
    if (summary) {
      const { outlier } = peerPosition(
        { amountMinor: row.currentAmountMinor, amountBaseMinor: row.currentAmountBaseMinor },
        summary,
      );
      if (outlier) sets[`outlier-${outlier}`].push(row.id);
    }
    if (
      hasNoRecentIncrease(
        { hireDate: row.hireDate, lastIncreaseOn: lastIncrease.get(row.id) ?? null },
        today,
      )
    ) {
      sets['no-raise-2y'].push(row.id);
    }
  }

  const compression = compressionGroups(
    rows.map((row) => ({
      employeeId: row.id,
      countryCode: row.countryCode,
      levelId: row.levelId,
      hireDate: row.hireDate,
      amountBaseMinor: row.currentAmountBaseMinor,
    })),
    today,
  );
  sets.compression = compression.flatMap((g) => g.tenuredEmployeeIds).sort((a, b) => a - b);

  return { activeHeadcount: rows.length, sets, compression };
}

export function getAttentionSets(db: DbHandle, today: string): AttentionSets {
  return findAttention(db, today).sets;
}

/** The union of the chosen sets, ascending. */
export function attentionEmployeeIds(sets: AttentionSets, values: readonly Attention[]): number[] {
  return [...new Set(values.flatMap((value) => sets[value]))].sort((a, b) => a - b);
}

export function getAttention(db: DbHandle, today: string): AttentionResponse {
  const { activeHeadcount, sets, compression } = findAttention(db, today);
  const outlierAbove = sets['outlier-above'].length;
  const outlierBelow = sets['outlier-below'].length;
  const countryNames = new Map(listCountries(db).map((c) => [c.code, c.name]));
  const levelCodes = new Map(listLevels(db).map((l) => [l.id, l.code]));

  return {
    asOf: today,
    activeHeadcount,
    outlierAbove,
    outlierBelow,
    outsidePeerRangeShareBp:
      activeHeadcount === 0
        ? 0
        : Number(
            divideRoundHalfAwayFromZero(
              BigInt(outlierAbove + outlierBelow) * 10_000n,
              BigInt(activeHeadcount),
            ),
          ),
    noRaise2y: sets['no-raise-2y'].length,
    compression: {
      peopleCount: sets.compression.length,
      groups: compression.map((group) => ({
        countryCode: group.countryCode,
        levelId: group.levelId,
        recentCount: group.recentCount,
        tenuredCount: group.tenuredCount,
        recentMedianBaseMinor: group.recentMedianBaseMinor,
        tenuredMedianBaseMinor: group.tenuredMedianBaseMinor,
        gapBp: group.gapBp,
        countryName: countryNames.get(group.countryCode) ?? group.countryCode,
        levelCode: levelCodes.get(group.levelId) ?? String(group.levelId),
      })),
    },
  };
}
