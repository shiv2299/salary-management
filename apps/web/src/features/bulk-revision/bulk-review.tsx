'use client';

import type { BulkOverride, BulkPreviewItem, BulkSummary } from '@acme/shared';
import type { UseQueryResult } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/pagination';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { formatChangeBp, formatMoney } from '@/lib/money';
import { useFxAsOfLabel } from '@/features/reference/use-reference';
import { AmountCell } from './amount-cell';
import {
  resolveNewAmount,
  reviewCounts,
  reviewRows,
  type Overrides,
  type ReviewView,
} from './bulk-state';
import { addedPayrollText, typicalPayText } from './figures-text';
import type { BulkPreview } from './use-bulk-revision';

export const PAGE_SIZE = 50;

export interface BulkReviewProps {
  preview: UseQueryResult<BulkPreview>;
  summary: UseQueryResult<BulkSummary>;
  /** The edits the summary was last asked about (after the pause that follows typing). */
  summaryOverrides: BulkOverride[];
  overrides: Overrides;
  onOverride: (employeeId: number, text: string | undefined) => void;
  percentageChosen: boolean;
}

function fullName(item: BulkPreviewItem): string {
  return `${item.firstName} ${item.lastName}`;
}

function PeerTag({ item }: { item: BulkPreviewItem }) {
  if (item.outsidePeerRange === null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warning">
      <TriangleAlert aria-hidden="true" className="size-3" />
      {item.outsidePeerRange === 'above' ? 'Above range' : 'Below range'}
    </span>
  );
}

function RetryAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-3 text-sm text-negative">
      <span>{message}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">Loading preview</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-8" />
      ))}
    </div>
  );
}

export function BulkReview({
  preview,
  summary,
  summaryOverrides,
  overrides,
  onOverride,
  percentageChosen,
}: BulkReviewProps) {
  const isDesktop = useIsDesktop();
  const fxLabel = useFxAsOfLabel();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ReviewView>('all');
  const [page, setPage] = useState(1);

  if (!percentageChosen) {
    return <p className="text-sm text-text-secondary">Choose an increase to see the review.</p>;
  }
  if (!preview.data) {
    return preview.isError ? (
      <RetryAlert
        message={preview.error.message}
        onRetry={() => {
          void preview.refetch();
        }}
      />
    ) : (
      <ReviewSkeleton />
    );
  }
  const items = preview.data.items;
  if (items.length === 0) {
    return <p className="text-sm text-text-primary">No active employees in this selection.</p>;
  }

  const counts = reviewCounts(items, overrides);
  const rows = reviewRows(items, overrides, { search, view });
  const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, lastPage);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const revision = summary.data?.revision ?? null;
  const added = revision ? addedPayrollText(revision) : null;
  const typical = revision ? typicalPayText(revision) : null;
  const headcount = summary.data?.headcount ?? items.length;
  const anyForeign = items.some((item) => item.currencyCode !== 'USD');

  function changeText(item: BulkPreviewItem): ReactNode {
    const resolved = resolveNewAmount(item, overrides[item.employeeId]);
    if (!resolved.overridden) return formatChangeBp(item.changeBp);
    if (!resolved.valid) return '—';
    const asked = summaryOverrides.some(
      (edit) => edit.employeeId === item.employeeId && edit.newAmountMinor === resolved.amountMinor,
    );
    const figure = summary.isPlaceholderData
      ? undefined
      : revision?.overrideChangeBp.find((entry) => entry.employeeId === item.employeeId);
    if (asked && figure) return formatChangeBp(figure.changeBp);
    return (
      <>
        <span aria-hidden="true">…</span>
        <span className="sr-only">Updating</span>
      </>
    );
  }

  const cell = (item: BulkPreviewItem) => (
    <AmountCell
      item={item}
      text={overrides[item.employeeId]}
      onChange={(text) => {
        onOverride(item.employeeId, text);
      }}
    />
  );
  const usdOf = (minor: number, item: BulkPreviewItem) =>
    item.currencyCode === 'USD' ? null : (
      <span className="text-xs text-text-secondary">{formatMoney(minor, 'USD')}</span>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.isError && !summary.data ? (
          <div className="col-span-2 flex items-center rounded-md border border-border p-4 lg:col-span-3">
            <RetryAlert
              message="Could not update the totals."
              onRetry={() => {
                void summary.refetch();
              }}
            />
          </div>
        ) : (
          <>
            <StatTile
              label="Added to annual payroll"
              value={added?.headline ?? '…'}
              hint={added?.detail}
            />
            <StatTile label="Typical pay" value={typical?.headline ?? '…'} hint={typical?.detail} />
            <StatTile
              label="Rows overridden"
              value={revision ? revision.overriddenCount.toLocaleString('en-US') : '…'}
              hint={`of ${headcount.toLocaleString('en-US')}`}
            />
          </>
        )}
        <StatTile
          label="Outside peer range"
          value={counts.outside.toLocaleString('en-US')}
          tone={counts.outside > 0 ? 'warning' : 'neutral'}
          hint="before this revision"
        />
      </div>
      {anyForeign && fxLabel ? <p className="text-xs text-text-secondary">{fxLabel}</p> : null}

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Input
          type="search"
          aria-label="Search people in this revision"
          placeholder="Search by name"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="md:max-w-64"
        />
        <SegmentedControl<ReviewView>
          label="Show"
          value={view}
          options={[
            { value: 'all', label: 'All' },
            { value: 'overridden', label: `Overridden (${counts.overridden})` },
            { value: 'outside', label: `Outside peer range (${counts.outside})` },
          ]}
          onChange={(next) => {
            setView(next);
            setPage(1);
          }}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No one matches this search.</p>
      ) : (
        <div className={preview.isPlaceholderData ? 'opacity-60' : undefined}>
          {isDesktop ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead numeric>Current</TableHead>
                  <TableHead numeric>New salary</TableHead>
                  <TableHead numeric>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((item) => {
                  const edited = resolveNewAmount(item, overrides[item.employeeId]).overridden;
                  return (
                    <TableRow key={item.employeeId}>
                      <TableCell className="h-auto">
                        <span className="flex items-center gap-2">
                          <Avatar name={fullName(item)} />
                          <span className="flex flex-col">
                            <span className="font-medium text-text-primary">{fullName(item)}</span>
                            <PeerTag item={item} />
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-text-primary">{item.departmentName}</TableCell>
                      <TableCell numeric className="text-text-primary">
                        <span className="flex flex-col items-end">
                          {formatMoney(item.currentAmountMinor, item.currencyCode)}
                          {usdOf(item.currentAmountBaseMinor, item)}
                        </span>
                      </TableCell>
                      <TableCell numeric className="h-auto">
                        <span className="flex items-start justify-end gap-2">
                          {!edited ? usdOf(item.proposedAmountBaseMinor, item) : null}
                          {cell(item)}
                        </span>
                      </TableCell>
                      <TableCell numeric className="text-positive">
                        {changeText(item)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <ul className="flex flex-col">
              {pageRows.map((item) => (
                <li
                  key={item.employeeId}
                  className="flex flex-col gap-2 border-b border-border py-3"
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={fullName(item)} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-text-primary">{fullName(item)}</span>
                      <span className="text-xs text-text-secondary">
                        {item.departmentName} ·{' '}
                        {formatMoney(item.currentAmountMinor, item.currencyCode)}
                      </span>
                      <PeerTag item={item} />
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="pt-3 text-sm text-positive tabular-nums">
                      {changeText(item)}
                    </span>
                    {cell(item)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {rows.length > 0 ? (
        <Pagination page={currentPage} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />
      ) : null}
    </div>
  );
}
