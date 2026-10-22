import type { BulkSummary } from '@acme/shared';
import { bulkSummary } from '@/test/fixtures';
import { describe, expect, it } from 'vitest';
import { addedPayrollText, typicalPayText } from './figures-text';

function rev(overrides: Partial<NonNullable<BulkSummary['revision']>> = {}) {
  return { ...bulkSummary().revision!, ...overrides };
}

describe('figure wording', () => {
  it('shows the added payroll of a single-currency selection in that currency', () => {
    expect(addedPayrollText(rev())).toEqual({ headline: '+$14,000.00', detail: null });
    expect(
      addedPayrollText(
        rev({
          addedByCurrency: [{ currencyCode: 'INR', addedMinor: 35_000_000 }],
          addedBaseMinor: 419_300,
        }),
      ),
    ).toEqual({ headline: '+₹3,50,000.00', detail: '+$4,193.00 in USD' });
  });

  it('shows the USD total with each currency beside it for a mixed selection', () => {
    expect(
      addedPayrollText(
        rev({
          addedByCurrency: [
            { currencyCode: 'INR', addedMinor: 35_000_000 },
            { currencyCode: 'USD', addedMinor: 1_700_000 },
          ],
          addedBaseMinor: 2_119_300,
        }),
      ),
    ).toEqual({ headline: '+$21,193.00', detail: '+₹3,50,000.00 · +$17,000.00' });
  });

  it('gives the typical pay after with the pay before as the hint, saying when it is in USD', () => {
    expect(typicalPayText(rev())).toEqual({
      headline: '$107,000.00',
      detail: 'up from $100,000.00 · median',
    });
    expect(
      typicalPayText(
        rev({
          addedByCurrency: [
            { currencyCode: 'INR', addedMinor: 1 },
            { currencyCode: 'USD', addedMinor: 1 },
          ],
        }),
      ).detail,
    ).toBe('up from $100,000.00 · median, in USD');
    expect(typicalPayText(rev({ typical: null }))).toEqual({ headline: '—', detail: null });
  });
});
