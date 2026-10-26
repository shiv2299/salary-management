import { describe, expect, it } from 'vitest';
import { increaseEvents, summariseIncreases, type IncreaseEvent } from './increases';
import type { PayRow } from './payroll';

function row(
  id: number,
  effectiveDate: string,
  reason: PayRow['reason'],
  amountMinor: number,
  currencyCode = 'USD',
  amountBaseMinor = amountMinor,
): PayRow {
  return {
    id,
    effectiveDate,
    reason,
    amountMinor,
    currencyCode,
    amountBaseMinor,
    countryCode: 'US',
  };
}

const rows: PayRow[] = [
  row(1, '2020-01-01', 'hire', 1_000_000),
  row(2, '2022-04-01', 'raise', 1_030_000),
  row(3, '2022-10-01', 'raise', 1_081_500),
  row(4, '2023-03-01', 'promotion', 1_243_725),
  row(5, '2023-06-01', 'correction', 1_240_000),
];
const person = { departmentId: 3, rows };

describe('increaseEvents', () => {
  it('lists raises and promotions with their change and USD added', () => {
    const events = increaseEvents(person);
    expect(events).toEqual([
      {
        effectiveDate: '2022-04-01',
        reason: 'raise',
        countryCode: 'US',
        departmentId: 3,
        changeBp: 300,
        addedBaseMinor: 30_000,
      },
      {
        effectiveDate: '2022-10-01',
        reason: 'raise',
        countryCode: 'US',
        departmentId: 3,
        changeBp: 500,
        addedBaseMinor: 51_500,
      },
      {
        effectiveDate: '2023-03-01',
        reason: 'promotion',
        countryCode: 'US',
        departmentId: 3,
        changeBp: 1500,
        addedBaseMinor: 162_225,
      },
    ]);
  });

  it('orders rows by date then id before comparing', () => {
    const shuffled = [3, 0, 4, 2, 1].map((i) => rows[i]!);
    expect(increaseEvents({ departmentId: 3, rows: shuffled })).toEqual(increaseEvents(person));
  });

  it('leaves out the average for a raise that changes currency', () => {
    const events = increaseEvents({
      departmentId: 3,
      rows: [
        row(1, '2020-01-01', 'hire', 8_000_000, 'INR', 96_000),
        row(2, '2021-01-01', 'raise', 1_100_000, 'USD', 1_100_000),
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.changeBp).toBeNull();
    expect(events[0]!.addedBaseMinor).toBe(1_100_000 - 96_000);
  });
});

describe('summariseIncreases', () => {
  function raise(changeBp: number | null, addedBaseMinor = 0): IncreaseEvent {
    return {
      effectiveDate: '2022-01-01',
      reason: 'raise',
      countryCode: 'US',
      departmentId: 3,
      changeBp,
      addedBaseMinor,
    };
  }

  it('averages raises half away from zero', () => {
    expect(summariseIncreases([raise(333), raise(334)]).averageRaiseBp).toBe(334);
    expect(summariseIncreases([raise(300), raise(500)]).averageRaiseBp).toBe(400);
  });

  it('sums what raises and promotions added', () => {
    expect(summariseIncreases(increaseEvents(person))).toEqual({
      raiseCount: 2,
      averageRaiseBp: 400,
      raisesAddedBaseMinor: 81_500,
      promotionCount: 1,
      promotionsAddedBaseMinor: 162_225,
      totalAddedBaseMinor: 243_725,
    });
  });

  it('has no average without raises', () => {
    expect(summariseIncreases([])).toEqual({
      raiseCount: 0,
      averageRaiseBp: null,
      raisesAddedBaseMinor: 0,
      promotionCount: 0,
      promotionsAddedBaseMinor: 0,
      totalAddedBaseMinor: 0,
    });
  });
});
