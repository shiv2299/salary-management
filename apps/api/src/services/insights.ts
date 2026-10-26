import type { DbHandle } from '../db/client';
import { BASE_CURRENCY } from '../domain/fx';
import { computeDistribution } from '../domain/stats';
import { listCountries } from '../repositories/countries';
import { listDepartments } from '../repositories/departments';
import { listActiveEmployeeRows, type EmployeeListRow } from '../repositories/employees';
import { listLevels } from '../repositories/levels';

export type DistributionGroupBy = 'country' | 'department' | 'level';

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
