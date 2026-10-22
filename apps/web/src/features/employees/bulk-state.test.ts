import type { BulkPreviewItem } from '@acme/shared';
import { bulkPreviewItem } from '@/test/fixtures';
import { describe, expect, it } from 'vitest';
import {
  buildConfirmBody,
  keepUnaffectedOverrides,
  resolveNewAmount,
  summarize,
} from './bulk-state';

function item(overrides: Partial<BulkPreviewItem> = {}): BulkPreviewItem {
  return bulkPreviewItem({
    employeeId: 1,
    firstName: 'Asha',
    lastName: 'Rao',
    countryCode: 'IN',
    departmentName: 'Engineering',
    levelCode: 'L3',
    currencyCode: 'USD',
    currentAmountMinor: 10_000_00,
    proposedAmountMinor: 10_700_00,
    ...overrides,
  });
}

describe('resolveNewAmount', () => {
  it('uses the proposed amount when the cell has not been edited', () => {
    expect(resolveNewAmount(item(), undefined)).toEqual({
      amountMinor: 10_700_00,
      overridden: false,
      valid: true,
    });
  });

  it('treats typing the proposed amount again as no override', () => {
    expect(resolveNewAmount(item(), '10,700.00').overridden).toBe(false);
  });

  it('applies a hand-typed amount exactly as entered', () => {
    expect(resolveNewAmount(item(), '11000.50')).toEqual({
      amountMinor: 11_000_50,
      overridden: true,
      valid: true,
    });
  });

  it('rejects text that is not an amount and amounts that do not raise pay', () => {
    expect(resolveNewAmount(item(), 'abc').valid).toBe(false);
    expect(resolveNewAmount(item(), '10000').valid).toBe(false);
    expect(resolveNewAmount(item(), '9000').valid).toBe(false);
  });
});

describe('summarize', () => {
  const items = [
    item({ employeeId: 1 }),
    item({
      employeeId: 2,
      currencyCode: 'INR',
      currentAmountMinor: 100_00,
      proposedAmountMinor: 107_00,
    }),
    item({ employeeId: 3, currentAmountMinor: 20_000_00, proposedAmountMinor: 21_400_00 }),
  ];

  it('counts people and overrides and totals the increase per currency', () => {
    const summary = summarize(items, { 3: '22000' });

    expect(summary.count).toBe(3);
    expect(summary.overriddenCount).toBe(1);
    expect(summary.invalidCount).toBe(0);
    expect(summary.increaseByCurrency).toEqual([
      { currencyCode: 'USD', increaseMinor: 700_00n + 2_000_00n },
      { currencyCode: 'INR', increaseMinor: 7_00n },
    ]);
  });

  it('counts invalid cells so the confirm button can stay disabled', () => {
    expect(summarize(items, { 1: 'oops' }).invalidCount).toBe(1);
  });
});

describe('buildConfirmBody', () => {
  it('lists every previewed employee with the amount the preview was based on', () => {
    const body = buildConfirmBody(
      [item(), item({ employeeId: 2 })],
      { 2: '12000' },
      {
        percentageBp: 700,
        effectiveDate: '2026-10-01',
        note: 'Annual cycle',
      },
    );

    expect(body).toEqual({
      percentageBp: 700,
      effectiveDate: '2026-10-01',
      note: 'Annual cycle',
      items: [
        { employeeId: 1, expectedCurrentAmountMinor: 10_000_00, newAmountMinor: 10_700_00 },
        { employeeId: 2, expectedCurrentAmountMinor: 10_000_00, newAmountMinor: 12_000_00 },
      ],
    });
  });
});

describe('keepUnaffectedOverrides', () => {
  it('keeps overrides for employees whose pay is unchanged and drops the rest', () => {
    const before = [item({ employeeId: 1 }), item({ employeeId: 2 }), item({ employeeId: 3 })];
    const after = [
      item({ employeeId: 1 }),
      item({ employeeId: 2, currentAmountMinor: 10_500_00, proposedAmountMinor: 11_235_00 }),
    ];

    expect(keepUnaffectedOverrides(before, after, { 1: '11000', 2: '12000', 3: '13000' })).toEqual({
      1: '11000',
    });
  });
});
