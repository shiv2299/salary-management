import { describe, expect, it } from 'vitest';
import { historyChangeBp } from './history-change';

describe('historyChangeBp', () => {
  it('compares each row with the row before it by effective date, leaving the first row empty', () => {
    const result = historyChangeBp(
      [
        { id: 3, effectiveDate: '2024-01-01', amountMinor: 110, currencyCode: 'USD' },
        { id: 1, effectiveDate: '2020-01-01', amountMinor: 100, currencyCode: 'USD' },
        { id: 4, effectiveDate: '2022-01-01', amountMinor: 105, currencyCode: 'USD' }, // backdated entry
      ],
      {},
    );

    expect(result).toEqual(
      new Map([
        [1, null],
        [4, 500],
        [3, 476],
      ]),
    );
  });

  it('breaks a same-day tie by id', () => {
    const result = historyChangeBp(
      [
        { id: 2, effectiveDate: '2020-01-01', amountMinor: 110, currencyCode: 'USD' },
        { id: 1, effectiveDate: '2020-01-01', amountMinor: 100, currencyCode: 'USD' },
      ],
      {},
    );

    expect(result).toEqual(
      new Map([
        [1, null],
        [2, 1000],
      ]),
    );
  });

  it('compares a change of currency in USD at the given rates', () => {
    const rates = { INR: 11_980_000, EUR: 1_080_000_000 };

    const result = historyChangeBp(
      [
        { id: 1, effectiveDate: '2020-01-01', amountMinor: 500_000_000, currencyCode: 'INR' }, // $59,900.00
        { id: 2, effectiveDate: '2021-01-01', amountMinor: 6_000_000, currencyCode: 'EUR' }, // $64,800.00
      ],
      rates,
    );

    expect(result.get(2)).toBe(818);
  });

  it('leaves a row empty when the previous amount is zero in USD', () => {
    const rates = { INR: 11_980_000 };

    const result = historyChangeBp(
      [
        { id: 1, effectiveDate: '2020-01-01', amountMinor: 1, currencyCode: 'INR' }, // under half a cent
        { id: 2, effectiveDate: '2021-01-01', amountMinor: 6_000_000, currencyCode: 'USD' },
      ],
      rates,
    );

    expect(result.get(2)).toBeNull();
  });
});
