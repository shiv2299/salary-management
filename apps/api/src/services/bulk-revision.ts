import type { DbHandle } from '../db/client';
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
