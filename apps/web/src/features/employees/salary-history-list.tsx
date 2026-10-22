'use client';

import type { EmployeeDetail } from '@acme/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from 'cn';
import { formatChangeBp, formatMoney } from '@/lib/money';
import { REASON_LABELS } from './reason-labels';
import { formatDate, useCountries } from '@/features/reference/use-reference';

function changeTone(bp: number): string {
  if (bp > 0) return 'text-positive';
  if (bp < 0) return 'text-negative';
  return 'text-text-secondary';
}

export function SalaryHistoryList({ employee }: { employee: EmployeeDetail }) {
  const countries = useCountries().data ?? [];

  return (
    <ol aria-label="Salary history" className="flex flex-col">
      {employee.history.map((entry) => (
        <li
          key={entry.id}
          className="flex items-start justify-between gap-3 border-b border-border py-2.5 text-sm"
        >
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{REASON_LABELS[entry.reason]}</Badge>
              <span className="font-medium tabular-nums">
                {formatMoney(entry.amountMinor, entry.currencyCode)}
              </span>
              {entry.changeBp !== null && (
                <span
                  className={cn('text-xs font-medium tabular-nums', changeTone(entry.changeBp))}
                >
                  {formatChangeBp(entry.changeBp)}
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              {entry.levelCode} ·{' '}
              {countries.find((country) => country.code === entry.countryCode)?.name ??
                entry.countryCode}
              {entry.batchId !== null && <Badge variant="outline">Bulk revision</Badge>}
            </span>
          </span>
          <span className="shrink-0 text-xs text-text-secondary">
            {formatDate(entry.effectiveDate)}
          </span>
        </li>
      ))}
    </ol>
  );
}
