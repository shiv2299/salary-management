import type { BulkConfirmBody, BulkPreviewItem } from '@acme/shared';
import { parseMajorToMinor } from '@/lib/money';

/** Hand-typed override text keyed by employee id. Absent means "use the proposed amount". */
export type Overrides = Record<number, string>;

export interface ResolvedAmount {
  amountMinor: number;
  overridden: boolean;
  /** False for text that is not an amount or does not raise pay; blocks the confirm. */
  valid: boolean;
}

export function resolveNewAmount(
  item: BulkPreviewItem,
  overrideText: string | undefined,
): ResolvedAmount {
  const proposed = item.proposedAmountMinor;
  if (overrideText === undefined) return { amountMinor: proposed, overridden: false, valid: true };

  const typed = parseMajorToMinor(overrideText, item.currencyCode);
  if (typed === null) return { amountMinor: proposed, overridden: true, valid: false };
  if (typed === proposed) return { amountMinor: proposed, overridden: false, valid: true };
  // Every bulk row is a raise, so an override must exceed the current pay (a comparison, not math).
  return { amountMinor: typed, overridden: true, valid: typed > item.currentAmountMinor };
}

export interface BulkSummary {
  count: number;
  overriddenCount: number;
  invalidCount: number;
  /** Exact sums of new minus current within each currency; the browser never converts. */
  increaseByCurrency: { currencyCode: string; increaseMinor: bigint }[];
}

export function summarize(items: BulkPreviewItem[], overrides: Overrides): BulkSummary {
  let overriddenCount = 0;
  let invalidCount = 0;
  const totals = new Map<string, bigint>();
  for (const item of items) {
    const resolved = resolveNewAmount(item, overrides[item.employeeId]);
    if (resolved.overridden) overriddenCount += 1;
    if (!resolved.valid) {
      invalidCount += 1;
      continue;
    }
    const increase = BigInt(resolved.amountMinor) - BigInt(item.currentAmountMinor);
    totals.set(item.currencyCode, (totals.get(item.currencyCode) ?? 0n) + increase);
  }
  return {
    count: items.length,
    overriddenCount,
    invalidCount,
    increaseByCurrency: [...totals].map(([currencyCode, increaseMinor]) => ({
      currencyCode,
      increaseMinor,
    })),
  };
}

export function buildConfirmBody(
  items: BulkPreviewItem[],
  overrides: Overrides,
  meta: { percentageBp: number; effectiveDate: string; note: string },
): BulkConfirmBody {
  return {
    ...meta,
    items: items.map((item) => ({
      employeeId: item.employeeId,
      expectedCurrentAmountMinor: item.currentAmountMinor,
      newAmountMinor: resolveNewAmount(item, overrides[item.employeeId]).amountMinor,
    })),
  };
}

/** After a stale preview is reloaded, keeps overrides only for people whose pay did not change. */
export function keepUnaffectedOverrides(
  before: BulkPreviewItem[],
  after: BulkPreviewItem[],
  overrides: Overrides,
): Overrides {
  const previous = new Map(before.map((item) => [item.employeeId, item.currentAmountMinor]));
  const kept: Overrides = {};
  for (const item of after) {
    const text = overrides[item.employeeId];
    if (text !== undefined && previous.get(item.employeeId) === item.currentAmountMinor) {
      kept[item.employeeId] = text;
    }
  }
  return kept;
}
