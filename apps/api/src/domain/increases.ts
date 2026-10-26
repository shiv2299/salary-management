import { divideRoundHalfAwayFromZero } from './money';
import type { PayRow } from './payroll';
import { percentChangeBpOrNull } from './revision';

export interface IncreaseEvent {
  effectiveDate: string;
  reason: 'raise' | 'promotion';
  countryCode: string;
  departmentId: number;
  /** % change from the row before, in bp; null when the currency changed. */
  changeBp: number | null;
  /** USD added to annual pay: this row's amountBaseMinor minus the previous row's. */
  addedBaseMinor: number;
}

/**
 * The raises and promotions in a person's history. The previous row is the row before by
 * effective date, ties by id. Hires, relocations and corrections are not increases.
 */
export function increaseEvents(person: { departmentId: number; rows: PayRow[] }): IncreaseEvent[] {
  const ordered = [...person.rows].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id - b.id,
  );
  const events: IncreaseEvent[] = [];
  ordered.forEach((row, index) => {
    const previous = ordered[index - 1];
    if (!previous || (row.reason !== 'raise' && row.reason !== 'promotion')) return;
    events.push({
      effectiveDate: row.effectiveDate,
      reason: row.reason,
      countryCode: row.countryCode,
      departmentId: person.departmentId,
      changeBp:
        previous.currencyCode === row.currencyCode
          ? percentChangeBpOrNull(previous.amountMinor, row.amountMinor)
          : null,
      addedBaseMinor: row.amountBaseMinor - previous.amountBaseMinor,
    });
  });
  return events;
}

export interface IncreaseStats {
  raiseCount: number;
  /** Mean of the raises' changeBp (same-currency raises only), half away from zero; null when none. */
  averageRaiseBp: number | null;
  raisesAddedBaseMinor: number;
  promotionCount: number;
  promotionsAddedBaseMinor: number;
  totalAddedBaseMinor: number;
}

export function summariseIncreases(events: IncreaseEvent[]): IncreaseStats {
  const raises = events.filter((event) => event.reason === 'raise');
  const promotions = events.filter((event) => event.reason === 'promotion');
  const sum = (list: IncreaseEvent[]) => list.reduce((total, e) => total + e.addedBaseMinor, 0);
  const bps = raises.flatMap((event) => (event.changeBp === null ? [] : [event.changeBp]));
  const averageRaiseBp =
    bps.length === 0
      ? null
      : Number(
          divideRoundHalfAwayFromZero(
            BigInt(bps.reduce((total, bp) => total + bp, 0)),
            BigInt(bps.length),
          ),
        );
  const raisesAddedBaseMinor = sum(raises);
  const promotionsAddedBaseMinor = sum(promotions);
  return {
    raiseCount: raises.length,
    averageRaiseBp,
    raisesAddedBaseMinor,
    promotionCount: promotions.length,
    promotionsAddedBaseMinor,
    totalAddedBaseMinor: raisesAddedBaseMinor + promotionsAddedBaseMinor,
  };
}
