import { describe, expect, it } from 'vitest';
import { selectCurrentRow } from './current-salary';

type Row = { id: number; effectiveDate: string; amountMinor: number };

describe('selectCurrentRow', () => {
  it('selects the row with the latest effective date', () => {
    const rows: Row[] = [
      { id: 1, effectiveDate: '2020-01-01', amountMinor: 100 },
      { id: 2, effectiveDate: '2024-06-01', amountMinor: 200 },
      { id: 3, effectiveDate: '2022-03-15', amountMinor: 150 },
    ];
    expect(selectCurrentRow(rows).id).toBe(2);
  });

  it('does not let a backdated row become current', () => {
    const rows: Row[] = [
      { id: 1, effectiveDate: '2023-01-01', amountMinor: 100 },
      { id: 2, effectiveDate: '2025-01-01', amountMinor: 300 },
      { id: 3, effectiveDate: '2024-01-01', amountMinor: 999 },
    ];
    expect(selectCurrentRow(rows).id).toBe(2);
  });

  it('lets a correction with the same effective date and a higher id become current', () => {
    const rows: Row[] = [
      { id: 1, effectiveDate: '2024-05-01', amountMinor: 100 },
      { id: 7, effectiveDate: '2024-05-01', amountMinor: 120 },
    ];
    expect(selectCurrentRow(rows).id).toBe(7);
  });

  it('gives the same answer regardless of input order', () => {
    const rows: Row[] = [
      { id: 4, effectiveDate: '2024-05-01', amountMinor: 400 },
      { id: 1, effectiveDate: '2021-01-01', amountMinor: 100 },
      { id: 9, effectiveDate: '2024-05-01', amountMinor: 500 },
      { id: 3, effectiveDate: '2023-01-01', amountMinor: 300 },
    ];
    const forward = selectCurrentRow(rows);
    const reversed = selectCurrentRow([...rows].reverse());
    expect(forward.id).toBe(9);
    expect(reversed.id).toBe(9);
  });

  it('does not mutate the input array', () => {
    const rows: Row[] = [
      { id: 2, effectiveDate: '2024-01-01', amountMinor: 200 },
      { id: 1, effectiveDate: '2020-01-01', amountMinor: 100 },
    ];
    const before = rows.map((row) => row.id);
    selectCurrentRow(rows);
    expect(rows.map((row) => row.id)).toEqual(before);
  });

  it('throws when there are no rows', () => {
    expect(() => selectCurrentRow<Row>([])).toThrow('Cannot select a current row from no rows');
  });
});
