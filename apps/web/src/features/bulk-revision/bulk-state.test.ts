import type { BulkPreviewItem } from '@acme/shared';
import { bulkPreviewItem } from '@/test/fixtures';
import { describe, expect, it } from 'vitest';
import {
  buildConfirmBody,
  countInvalid,
  keepUnaffectedOverrides,
  overridesForSummary,
  resolveNewAmount,
  reviewCounts,
  reviewRows,
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

  it('rejects an amount above the largest the system stores', () => {
    expect(resolveNewAmount(item(), '900000000.01').valid).toBe(false);
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

describe('review state over the loaded preview', () => {
  const items = [
    bulkPreviewItem(),
    bulkPreviewItem({ employeeId: 2, firstName: 'Ravi', lastName: 'Menon' }),
    bulkPreviewItem({
      employeeId: 3,
      firstName: 'Mia',
      lastName: 'Lopez',
      outsidePeerRange: 'below',
    }),
  ];

  it('sends only valid edits that differ from the proposed amount, ordered by employee', () => {
    expect(
      overridesForSummary(items, { 3: '120000', 1: '107,000.00', 2: 'abc', 9: '200000' }),
    ).toEqual([{ employeeId: 3, newAmountMinor: 12_000_000 }]);
  });

  it('counts edits that are not a valid raise', () => {
    expect(countInvalid(items, { 1: 'abc', 2: '90000' })).toBe(2);
  });

  it('counts edited rows, invalid ones included, and people outside their peer range', () => {
    expect(reviewCounts(items, { 1: 'abc', 2: '120000' })).toEqual({ overridden: 2, outside: 1 });
  });

  it('finds people by any part of their name, ignoring case', () => {
    expect(
      reviewRows(items, {}, { search: 'menON', view: 'all' }).map((i) => i.employeeId),
    ).toEqual([2]);
  });

  it('shows only the edited rows or only the people outside their peer range', () => {
    expect(
      reviewRows(items, { 2: '120000' }, { search: '', view: 'overridden' }).map(
        (i) => i.employeeId,
      ),
    ).toEqual([2]);
    expect(reviewRows(items, {}, { search: '', view: 'outside' }).map((i) => i.employeeId)).toEqual(
      [3],
    );
  });
});
