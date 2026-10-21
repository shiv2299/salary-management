import type { PeerContext } from '@acme/shared';
import type { DbHandle } from '../db/client';
import { notFound } from '../errors';
import {
  peerGroupKey,
  peerPosition,
  summarisePeerGroup,
  type PeerGroupSummary,
  type PeerMember,
} from '../domain/peer-groups';
import { listCountries } from '../repositories/countries';
import { findEmployeeListRow, listActivePeerAmounts } from '../repositories/employees';

export interface PeerGroup {
  countryCode: string;
  levelId: number;
  /** The country's currency, in which the typical range is given. */
  currencyCode: string;
  headcount: number;
  summary: PeerGroupSummary | null;
}

/**
 * The single source of country and level peer statistics for active employees. Only groups with
 * members are returned, keyed by `peerGroupKey`. With `keys`, only those groups are read.
 */
export function getPeerGroups(
  db: DbHandle,
  keys?: { countryCode: string; levelId: number }[],
): Map<string, PeerGroup> {
  const currencies = new Map(listCountries(db).map((c) => [c.code, c.currencyCode]));
  const membersByKey = new Map<
    string,
    { countryCode: string; levelId: number; members: PeerMember[] }
  >();
  for (const row of listActivePeerAmounts(db, keys)) {
    const key = peerGroupKey(row.countryCode, row.levelId);
    const member: PeerMember = {
      amountMinor: row.amountMinor,
      currencyCode: row.currencyCode,
      amountBaseMinor: row.amountBaseMinor,
    };
    const group = membersByKey.get(key);
    if (group) group.members.push(member);
    else
      membersByKey.set(key, {
        countryCode: row.countryCode,
        levelId: row.levelId,
        members: [member],
      });
  }

  const groups = new Map<string, PeerGroup>();
  for (const [key, { countryCode, levelId, members }] of membersByKey) {
    const currencyCode = currencies.get(countryCode) ?? '';
    groups.set(key, {
      countryCode,
      levelId,
      currencyCode,
      headcount: members.length,
      summary: summarisePeerGroup(members, currencyCode),
    });
  }
  return groups;
}

/** Shapes a peer group as the drawer shows it, placing `amount` against the group. */
export function toPeerContext(
  group: PeerGroup,
  levelCode: string,
  amount: { amountMinor: number; amountBaseMinor: number },
): PeerContext {
  const { summary } = group;
  return {
    countryCode: group.countryCode,
    levelId: group.levelId,
    levelCode,
    currencyCode: group.currencyCode,
    headcount: group.headcount,
    typical: summary ? summary.typical : null,
    position: summary ? peerPosition(amount, summary) : null,
  };
}

export function getPeerContext(db: DbHandle, employeeId: number): PeerContext {
  const employee = findEmployeeListRow(db, employeeId);
  if (!employee) throw notFound('EMPLOYEE_NOT_FOUND', `Employee ${employeeId} not found`);

  const { countryCode, levelId } = employee;
  const group = getPeerGroups(db, [{ countryCode, levelId }]).get(
    peerGroupKey(countryCode, levelId),
  ) ?? {
    countryCode,
    levelId,
    currencyCode: listCountries(db).find((c) => c.code === countryCode)?.currencyCode ?? '',
    headcount: 0,
    summary: null,
  };
  return toPeerContext(group, employee.levelCode, {
    amountMinor: employee.currentAmountMinor,
    amountBaseMinor: employee.currentAmountBaseMinor,
  });
}
