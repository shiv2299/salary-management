import type { EmployeeDetail, PeerContext, SalaryChangePreview } from '@acme/shared';
import { cn } from 'cn';
import type { ReactNode } from 'react';
import { formatChangeBp, formatMoney, formatSignedMoney } from '@/lib/money';
import { comparisonSentence } from './peer-copy';

interface Props {
  employee: EmployeeDetail;
  /** `null` when there is no amount to compare; `undefined` while the server is still answering. */
  preview: SalaryChangePreview | null | undefined;
  currentPeer: PeerContext | undefined;
  /** The country whose peers the new salary is placed against: the destination of a relocation. */
  countryName: string;
  failed?: boolean;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </>
  );
}

/** Current, new and change for the salary being entered; every figure other than the subtraction comes from the server. */
export function SalaryComparison({ employee, preview, currentPeer, countryName, failed }: Props) {
  const { salary } = employee;
  const current = formatMoney(salary.amountMinor, salary.currencyCode);

  let body: ReactNode;
  if (preview) {
    const { proposed } = preview;
    // The local difference is only meaningful within one currency; across currencies the server's USD-based % stands alone.
    const change =
      proposed.currencyCode === salary.currencyCode
        ? `${formatSignedMoney(proposed.amountMinor - salary.amountMinor, proposed.currencyCode)} (${formatChangeBp(preview.changeBp)})`
        : formatChangeBp(preview.changeBp);
    body = (
      <>
        <Row label="New">{formatMoney(proposed.amountMinor, proposed.currencyCode)}</Row>
        <Row label="Change">
          <span
            className={cn(
              'block font-medium',
              preview.changeBp > 0 && 'text-positive',
              preview.changeBp < 0 && 'text-negative',
            )}
          >
            {change}
          </span>
          <span className="block text-xs text-text-secondary">
            {`${formatSignedMoney(preview.changeBaseMinor, 'USD')} a year`}
          </span>
        </Row>
      </>
    );
  }

  return (
    <section
      aria-label="Comparison"
      className="flex flex-col gap-2 rounded-md bg-surface p-3 text-sm"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <Row label="Current">{current}</Row>
        {body}
      </dl>
      {preview ? (
        <p className="text-xs text-text-secondary">
          {comparisonSentence(preview.peer, countryName, currentPeer)}
        </p>
      ) : (
        <p className="text-xs text-text-secondary">
          {preview === null
            ? 'Enter a new amount to compare'
            : failed
              ? 'Could not compare this change'
              : 'Comparing…'}
        </p>
      )}
    </section>
  );
}
