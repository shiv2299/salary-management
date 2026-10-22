import type { BulkOverride, BulkSummary } from '@acme/shared';
import type { DbHandle } from '../db/client';
import { bulkRevisionFigures } from '../domain/bulk-summary';
import { BASE_CURRENCY, convert } from '../domain/fx';
import { peerGroupKey, peerPosition } from '../domain/peer-groups';
import { percentChangeBp, proposedAmount } from '../domain/revision';
import { validateSalaryChange } from '../domain/salary-change-rules';
import { conflict, notFound, unprocessable } from '../errors';
import {
  findEmployeesByIds,
  type EmployeeListRow,
  listActiveEmployeeRowsByIds,
  listActiveEmployeeRowsMatching,
} from '../repositories/employees';
import { loadLatestFxRates } from '../repositories/fx-rates';
import { insertSalaryRevisionBatch } from '../repositories/salary-revision-batches';
import { getPeerGroups, type PeerGroup } from './peer-groups';
import { currencyInForce } from './salary-changes';
import { applySalaryChanges, type SalaryWriterDeps } from './salary-writer';

export type BulkSelectionInput =
  | { filter: { country?: string[]; department?: number[]; level?: number[]; search?: string } }
  | { employeeIds: number[] };

export type BulkPreviewInput = BulkSelectionInput & { percentageBp: number };

export type BulkSummaryInput = BulkSelectionInput & {
  percentageBp?: number;
  overrides?: BulkOverride[];
};

export interface BulkConfirmInput {
  percentageBp: number;
  effectiveDate: string;
  note: string;
  items: { employeeId: number; expectedCurrentAmountMinor: number; newAmountMinor: number }[];
}

/** The active employees a selection names: explicit ids, or everyone matching the filter. */
function selectedRows(db: DbHandle, selection: BulkSelectionInput): EmployeeListRow[] {
  return 'employeeIds' in selection
    ? listActiveEmployeeRowsByIds(db, selection.employeeIds)
    : listActiveEmployeeRowsMatching(db, definedOnly(selection.filter));
}

/**
 * Every active employee the selection matches, with the amount the percentage would give them,
 * both in USD, the resulting change and whether their current pay is already outside their
 * country and level peer range (the outliers rule). Read-only and not paginated: the UI pages
 * through it and holds overrides locally.
 */
export function previewBulkRevision(db: DbHandle, input: BulkPreviewInput) {
  const rows = selectedRows(db, input);
  const rates = loadLatestFxRates(db);
  const distinctPairs = new Map(
    rows.map((row) => [
      peerGroupKey(row.countryCode, row.levelId),
      { countryCode: row.countryCode, levelId: row.levelId },
    ]),
  );
  const groups =
    distinctPairs.size > 0
      ? getPeerGroups(db, [...distinctPairs.values()])
      : new Map<string, PeerGroup>();

  return {
    items: rows.map((row) => {
      const proposed = proposedAmount(row.currentAmountMinor, input.percentageBp);
      const summary = groups.get(peerGroupKey(row.countryCode, row.levelId))?.summary ?? null;
      return {
        employeeId: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        countryCode: row.countryCode,
        departmentName: row.departmentName,
        levelCode: row.levelCode,
        currencyCode: row.currentCurrencyCode,
        currentAmountMinor: row.currentAmountMinor,
        proposedAmountMinor: proposed,
        currentAmountBaseMinor: row.currentAmountBaseMinor,
        proposedAmountBaseMinor: convert(proposed, row.currentCurrencyCode, BASE_CURRENCY, rates),
        changeBp: percentChangeBp(row.currentAmountMinor, proposed),
        outsidePeerRange: summary
          ? peerPosition(
              {
                amountMinor: row.currentAmountMinor,
                amountBaseMinor: row.currentAmountBaseMinor,
              },
              summary,
            ).outlier
          : null,
      };
    }),
    total: rows.length,
  };
}

/**
 * The headline figures for a selection: its headcount and department mix, and, once a percentage
 * is chosen, the pay it would add (per currency and in USD), the typical pay before and after, and
 * the change each hand edit amounts to. An edit counts only for a selected person and only when it
 * differs from the amount the percentage gives. Read-only.
 */
export function summariseBulkRevision(db: DbHandle, input: BulkSummaryInput): BulkSummary {
  const rows = selectedRows(db, input);

  const perDepartment = new Map<string, number>();
  for (const row of rows) {
    perDepartment.set(row.departmentName, (perDepartment.get(row.departmentName) ?? 0) + 1);
  }
  const byDepartment = [...perDepartment]
    .map(([departmentName, headcount]) => ({ departmentName, headcount }))
    .sort((a, b) => b.headcount - a.headcount || a.departmentName.localeCompare(b.departmentName));

  const { percentageBp } = input;
  if (percentageBp === undefined) return { headcount: rows.length, byDepartment, revision: null };

  const overrides = new Map((input.overrides ?? []).map((o) => [o.employeeId, o.newAmountMinor]));
  const overrideChangeBp: { employeeId: number; changeBp: number }[] = [];
  const figureRows = rows.map((row) => {
    const proposed = proposedAmount(row.currentAmountMinor, percentageBp);
    const edited = overrides.get(row.id);
    if (edited !== undefined && edited !== proposed) {
      overrideChangeBp.push({
        employeeId: row.id,
        changeBp: percentChangeBp(row.currentAmountMinor, edited),
      });
    }
    return {
      currencyCode: row.currentCurrencyCode,
      currentAmountMinor: row.currentAmountMinor,
      currentAmountBaseMinor: row.currentAmountBaseMinor,
      newAmountMinor: edited ?? proposed,
    };
  });
  overrideChangeBp.sort((a, b) => a.employeeId - b.employeeId);

  return {
    headcount: rows.length,
    byDepartment,
    revision: {
      percentageBp,
      overriddenCount: overrideChangeBp.length,
      ...bulkRevisionFigures(figureRows, loadLatestFxRates(db)),
      overrideChangeBp,
    },
  };
}

function definedOnly<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Commits exactly the list the HR Manager reviewed. If any employee's pay changed or any has
 * become inactive since the preview, the whole request fails with a conflict and nothing is
 * written; otherwise one batch row and one writer call cover every item in one transaction.
 */
export function confirmBulkRevision(db: DbHandle, input: BulkConfirmInput, deps: SalaryWriterDeps) {
  return db.transaction((tx) => {
    const ids = input.items.map((item) => item.employeeId);
    if (new Set(ids).size !== ids.length) {
      throw unprocessable('INVALID_BULK_REVISION', 'an employee appears more than once');
    }

    const employees = new Map(findEmployeesByIds(tx, ids).map((e) => [e.id, e]));
    const missing = ids.filter((id) => !employees.has(id));
    if (missing.length > 0) {
      throw notFound('EMPLOYEE_NOT_FOUND', `Employees not found: ${missing.join(', ')}`);
    }

    const stale = input.items.filter(
      (item) =>
        employees.get(item.employeeId)!.currentAmountMinor !== item.expectedCurrentAmountMinor,
    );
    const inactive = ids.filter((id) => employees.get(id)!.status !== 'active');
    if (stale.length > 0 || inactive.length > 0) {
      throw conflict(
        'STALE_BULK_REVISION',
        `The preview is out of date: ${stale.length} employee(s) have a different current salary ` +
          `and ${inactive.length} are inactive. Nothing was changed; preview again.`,
      );
    }

    const today = deps.now().slice(0, 10);
    const violations = input.items.flatMap((item) => {
      const employee = employees.get(item.employeeId)!;
      return validateSalaryChange(
        {
          reason: 'raise',
          effectiveDate: input.effectiveDate,
          amountMinor: item.newAmountMinor,
        },
        {
          today,
          hireDate: employee.hireDate,
          status: employee.status,
          currentAmountMinor: employee.currentAmountMinor,
          currentCountryCode: employee.countryCode,
          currentLevelRank: 0,
        },
      ).map((violation) => `employee ${employee.id}: ${violation}`);
    });
    if (violations.length > 0) {
      throw unprocessable('INVALID_BULK_REVISION', violations.join('; '));
    }

    const batchId = insertSalaryRevisionBatch(tx, {
      createdAt: deps.now(),
      effectiveDate: input.effectiveDate,
      percentageBp: input.percentageBp,
      employeeCount: input.items.length,
      note: input.note,
    });
    applySalaryChanges(
      tx,
      input.items.map((item) => ({
        employeeId: item.employeeId,
        reason: 'raise' as const,
        amountMinor: item.newAmountMinor,
        currencyCode: currencyInForce(tx, employees.get(item.employeeId)!, input.effectiveDate),
        effectiveDate: input.effectiveDate,
        batchId,
      })),
      deps,
    );

    return { batchId, employeeCount: input.items.length, effectiveDate: input.effectiveDate };
  });
}
