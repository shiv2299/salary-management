import type { DbHandle } from '../db/client';
import { BASE_CURRENCY } from '../domain/fx';
import { peerGroupKey } from '../domain/peer-groups';
import { computeDistribution, isOutlier } from '../domain/stats';
import { listCountries } from '../repositories/countries';
import { listDepartments } from '../repositories/departments';
import { listActiveEmployeeRows, type EmployeeListRow } from '../repositories/employees';
import { listLevels } from '../repositories/levels';
import { getPeerGroups } from './peer-groups';

export type DistributionGroupBy = 'country' | 'department' | 'level';
export type PayrollGroupBy = 'country' | 'department';

interface GroupDefinition {
  key: string;
  label: string;
}

/** The groups of a dimension in display order, and which group an employee belongs to. */
function dimension(db: DbHandle, groupBy: DistributionGroupBy) {
  switch (groupBy) {
    case 'country':
      return {
        groups: listCountries(db).map((c): GroupDefinition => ({ key: c.code, label: c.name })),
        keyOf: (row: EmployeeListRow) => row.countryCode,
      };
    case 'department':
      return {
        groups: listDepartments(db).map((d): GroupDefinition => ({
          key: String(d.id),
          label: d.name,
        })),
        keyOf: (row: EmployeeListRow) => String(row.departmentId),
      };
    case 'level':
      return {
        groups: listLevels(db).map((l): GroupDefinition => ({ key: String(l.id), label: l.code })),
        keyOf: (row: EmployeeListRow) => String(row.levelId),
      };
  }
}

/** Active employees bucketed by group, in group order, leaving out groups nobody belongs to. */
function groupActiveEmployees(db: DbHandle, groupBy: DistributionGroupBy) {
  const { groups, keyOf } = dimension(db, groupBy);
  const buckets = new Map<string, EmployeeListRow[]>();
  for (const row of listActiveEmployeeRows(db)) {
    const key = keyOf(row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return groups.flatMap((group) => {
    const rows = buckets.get(group.key);
    return rows ? [{ ...group, rows }] : [];
  });
}

export function getDistribution(db: DbHandle, groupBy: DistributionGroupBy) {
  return {
    baseCurrency: BASE_CURRENCY,
    groupBy,
    groups: groupActiveEmployees(db, groupBy).map(({ key, label, rows }) => ({
      key,
      label,
      distribution: computeDistribution(rows.map((row) => row.currentAmountBaseMinor)),
    })),
  };
}

export function getPayroll(db: DbHandle, groupBy: PayrollGroupBy) {
  const groups = groupActiveEmployees(db, groupBy).map(({ key, label, rows }) => ({
    key,
    label,
    headcount: rows.length,
    totalBaseMinor: rows.reduce((total, row) => total + row.currentAmountBaseMinor, 0),
  }));
  return {
    baseCurrency: BASE_CURRENCY,
    groupBy,
    headcount: groups.reduce((total, g) => total + g.headcount, 0),
    totalBaseMinor: groups.reduce((total, g) => total + g.totalBaseMinor, 0),
    groups,
  };
}

/**
 * Employees paid outside Tukey's fences for their country and level peers. A peer group needs at
 * least `MIN_PEER_GROUP_SIZE` (see `getPeerGroups`) active employees to be evaluated. The fences are shown rounded to a
 * minor unit; the comparison itself uses the exact values.
 */
export function getOutliers(db: DbHandle) {
  const countryOrder = new Map(listCountries(db).map((c, index) => [c.code, index]));
  const levelOrder = new Map(listLevels(db).map((l, index) => [l.code, index]));
  const peerGroups = getPeerGroups(db);

  const items = listActiveEmployeeRows(db)
    .flatMap((row) => {
      const summary = peerGroups.get(peerGroupKey(row.countryCode, row.levelId))?.summary;
      if (!summary) return [];
      const { base, fences } = summary;
      if (!isOutlier(row.currentAmountBaseMinor, fences)) return [];
      return [
        {
          employeeId: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          countryCode: row.countryCode,
          departmentName: row.departmentName,
          levelCode: row.levelCode,
          jobTitle: row.jobTitle,
          salary: {
            amountMinor: row.currentAmountMinor,
            currencyCode: row.currentCurrencyCode,
            amountBaseMinor: row.currentAmountBaseMinor,
          },
          direction:
            row.currentAmountBaseMinor > fences.upper ? ('above' as const) : ('below' as const),
          peerGroup: {
            headcount: base.headcount,
            p25: base.p25,
            median: base.median,
            p75: base.p75,
            lowerFence: Math.round(fences.lower),
            upperFence: Math.round(fences.upper),
          },
        },
      ];
    })
    .sort(
      (a, b) =>
        (countryOrder.get(a.countryCode) ?? 0) - (countryOrder.get(b.countryCode) ?? 0) ||
        (levelOrder.get(a.levelCode) ?? 0) - (levelOrder.get(b.levelCode) ?? 0) ||
        b.salary.amountBaseMinor - a.salary.amountBaseMinor ||
        a.employeeId - b.employeeId,
    );

  return { baseCurrency: BASE_CURRENCY, total: items.length, items };
}
