import type { RecentChangeEntry } from '@acme/shared';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatPercentageBp, formatMoney } from '@/lib/money';
import { formatDate } from '@/features/reference/use-reference';
import { REASON_LABELS } from '@/features/employees/reason-labels';

export function changeEntryKey(entry: RecentChangeEntry): string {
  return entry.kind === 'batch' ? `b${entry.batchId}` : `h${entry.historyId}`;
}

/** One salary change, or one bulk revision as a single row. */
export function ChangeEntry({ entry }: { entry: RecentChangeEntry }) {
  if (entry.kind === 'batch') {
    const people = `${entry.headcount.toLocaleString('en-US')} ${entry.headcount === 1 ? 'person' : 'people'}`;
    const summary = [people, `+${formatPercentageBp(entry.percentageBp)}`, entry.note]
      .filter(Boolean)
      .join(' · ');
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
        <span className="flex items-center gap-2">
          <Badge variant="secondary">Bulk revision</Badge>
          <span className="font-medium">{summary}</span>
        </span>
        <span className="text-xs text-text-secondary">{formatDate(entry.effectiveDate)}</span>
      </li>
    );
  }

  const { employee, from, to } = entry;
  const increased =
    from !== null && from.currencyCode === to.currencyCode && to.amountMinor > from.amountMinor;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{REASON_LABELS[entry.reason]}</Badge>
        <Link
          href={`/employees/${employee.id}`}
          className="font-medium text-primary hover:underline"
        >
          {`${employee.firstName} ${employee.lastName}`}
        </Link>
        {employee.status === 'inactive' && <Badge variant="outline">Inactive</Badge>}
        <span className="tabular-nums">
          {from && (
            <>
              <span className="text-text-secondary">
                {formatMoney(from.amountMinor, from.currencyCode, { fraction: false })}
              </span>
              {' → '}
            </>
          )}
          <span className={increased ? 'text-positive' : undefined}>
            {formatMoney(to.amountMinor, to.currencyCode, { fraction: false })}
          </span>
        </span>
      </span>
      <span className="text-xs text-text-secondary">{formatDate(entry.effectiveDate)}</span>
    </li>
  );
}
