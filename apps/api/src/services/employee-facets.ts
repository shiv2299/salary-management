import type { EmployeeFacets } from '@acme/shared';
import type { DbHandle } from '../db/client';
import {
  countEmployeeRows,
  countEmployeesGroupedBy,
  type EmployeeListFilter,
} from '../repositories/employees';

/**
 * Counts for the filter options. Each group is counted under the search and every other group's
 * selection but not its own, so an option shows how many rows picking it would add or switch to.
 * Options nobody matches do not appear.
 */
export function getEmployeeFacets(db: DbHandle, filter: EmployeeListFilter): EmployeeFacets {
  const { status, country, department, level, search } = filter;
  const without = (group: 'status' | 'country' | 'department' | 'level'): EmployeeListFilter => ({
    status: group === 'status' ? 'all' : status,
    ...(group !== 'country' && country !== undefined && { country }),
    ...(group !== 'department' && department !== undefined && { department }),
    ...(group !== 'level' && level !== undefined && { level }),
    ...(search !== undefined && { search }),
  });

  return {
    statusTotal: countEmployeeRows(db, { status }),
    status: countEmployeesGroupedBy(db, without('status'), 'status') as EmployeeFacets['status'],
    country: countEmployeesGroupedBy(
      db,
      without('country'),
      'countryCode',
    ) as EmployeeFacets['country'],
    department: countEmployeesGroupedBy(
      db,
      without('department'),
      'departmentId',
    ) as EmployeeFacets['department'],
    level: countEmployeesGroupedBy(db, without('level'), 'levelId') as EmployeeFacets['level'],
  };
}
