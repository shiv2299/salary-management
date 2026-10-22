import type { BulkSummary as BulkSummaryResponse } from '@acme/shared';
import { formatMoney, formatSignedMoney } from '@/lib/money';

type Revision = NonNullable<BulkSummaryResponse['revision']>;

interface FigureText {
  headline: string;
  detail: string | null;
}

/** Added payroll: the one currency when there is one, otherwise the USD total with each beside it. */
export function addedPayrollText(revision: Revision): FigureText {
  const [only, ...others] = revision.addedByCurrency;
  const usd = formatSignedMoney(revision.addedBaseMinor, 'USD');
  if (only && others.length === 0) {
    const own = formatSignedMoney(only.addedMinor, only.currencyCode);
    return only.currencyCode === 'USD'
      ? { headline: own, detail: null }
      : { headline: own, detail: `${usd} in USD` };
  }
  return {
    headline: usd,
    detail: revision.addedByCurrency
      .map((entry) => formatSignedMoney(entry.addedMinor, entry.currencyCode))
      .join(' · '),
  };
}

/** Typical (median) pay after the revision, with the pay before as the hint. */
export function typicalPayText(revision: Revision): FigureText {
  if (!revision.typical) return { headline: '—', detail: null };
  const { currencyCode, beforeMinor, afterMinor } = revision.typical;
  const mixed = revision.addedByCurrency.length > 1;
  return {
    headline: formatMoney(afterMinor, currencyCode),
    detail: `up from ${formatMoney(beforeMinor, currencyCode)} · median${mixed ? ', in USD' : ''}`,
  };
}
