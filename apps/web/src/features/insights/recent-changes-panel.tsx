'use client';

import type { RecentChangeEntry } from '@acme/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatPercentageBp, formatMoney } from '@/lib/money';
import { formatDate } from '@/features/reference/use-reference';
import { REASON_LABELS } from '@/features/employees/reason-labels';
import { Panel, PanelError, RowsSkeleton } from './panel';
import { useRecentChanges } from './use-insights';

const PAGE_SIZE = 10;

function ChangeEntry({ entry }: { entry: RecentChangeEntry }) {
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

export function RecentChangesPanel() {
  const [range, setRange] = useState<'3y' | '5y'>('3y');
  const [offset, setOffset] = useState(0);
  const { data, error, isPending, refetch } = useRecentChanges({
    range,
    offset,
    limit: PAGE_SIZE,
  });

  return (
    <Panel
      title="Salary changes"
      description="By the date each change took effect, newest first. Includes employees who have since been deactivated."
      actions={
        <SegmentedControl
          label="Time window"
          value={range}
          options={[
            { value: '3y', label: '3 years' },
            { value: '5y', label: '5 years' },
          ]}
          onChange={(value) => {
            setRange(value);
            setOffset(0);
          }}
        />
      }
    >
      {isPending ? (
        <RowsSkeleton rows={6} label="Loading salary changes" />
      ) : error ? (
        <PanelError
          message={error.message}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : data.items.length === 0 ? (
        <p className="text-sm text-text-secondary">No salary changes in this window.</p>
      ) : (
        <>
          <ul>
            {data.items.map((entry) => (
              <ChangeEntry
                key={entry.kind === 'batch' ? `b${entry.batchId}` : `h${entry.historyId}`}
                entry={entry}
              />
            ))}
          </ul>
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>
              {offset + 1}–{offset + data.items.length} of {data.total.toLocaleString('en-US')}
            </span>
            <span className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous page"
                disabled={offset === 0}
                onClick={() => {
                  setOffset(Math.max(0, offset - PAGE_SIZE));
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next page"
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => {
                  setOffset(offset + PAGE_SIZE);
                }}
              >
                <ChevronRight />
              </Button>
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
