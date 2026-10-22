'use client';

import {
  bulkConfirmResponseSchema,
  bulkPreviewResponseSchema,
  type BulkPreviewBody,
  type BulkPreviewItem,
} from '@acme/shared';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { ApiError, apiSend } from '@/lib/api';
import { formatMoney, formatPercentageBp, parsePercentageToBp, toInputAmount } from '@/lib/money';
import {
  buildConfirmBody,
  keepUnaffectedOverrides,
  resolveNewAmount,
  summarize,
  type Overrides,
} from '../bulk-revision/bulk-state';
import { PAGE_SIZE } from './list-filters';

export type BulkTarget =
  { filter: NonNullable<BulkPreviewBody['filter']> } | { employeeIds: number[] };

interface Props {
  target: BulkTarget;
  /** Pre-filled batch note, such as "Engineering L3 India". */
  defaultNote: string;
  /** Today's date (UTC, yyyy-mm-dd), injected so tests are deterministic. */
  today: string;
  onClose: () => void;
  onDone: () => void;
}

interface Preview {
  items: BulkPreviewItem[];
  percentageBp: number;
}

function OverrideCell({
  item,
  value,
  onChange,
}: {
  item: BulkPreviewItem;
  value: string | undefined;
  onChange: (text: string) => void;
}) {
  const resolved = resolveNewAmount(item, value);
  const name = `${item.firstName} ${item.lastName}`;
  const message = resolved.valid
    ? null
    : value !== undefined && /^[\d,]*\.?\d*$/.test(value.trim()) && value.trim() !== ''
      ? 'Must be higher than the current amount'
      : 'Enter an amount, for example 1234.50';
  return (
    <div className="flex flex-col items-end gap-0.5">
      <Input
        inputMode="decimal"
        aria-label={`New amount for ${name}`}
        aria-invalid={resolved.valid ? undefined : true}
        data-overridden={resolved.overridden && resolved.valid ? 'true' : undefined}
        value={value ?? toInputAmount(item.proposedAmountMinor, item.currencyCode)}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="w-36 text-right tabular-nums data-[overridden=true]:border-primary data-[overridden=true]:bg-primary/5 data-[overridden=true]:font-medium"
      />
      {message && <span className="text-xs text-negative">{message}</span>}
      {resolved.overridden && resolved.valid && (
        <span className="text-xs text-primary">Overridden</span>
      )}
    </div>
  );
}

export function BulkRevisionPanel({ target, defaultNote, today, onClose, onDone }: Props) {
  const isDesktop = useIsDesktop();
  const [percentageText, setPercentageText] = useState('');
  const [percentageError, setPercentageError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [page, setPage] = useState(0);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [note, setNote] = useState(defaultNote);
  const [alert, setAlert] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: (percentageBp: number) =>
      apiSend('POST', '/api/employees/bulk-salary-changes/preview', bulkPreviewResponseSchema, {
        ...target,
        percentageBp,
      }),
  });

  const confirmMutation = useMutation({
    mutationFn: (body: ReturnType<typeof buildConfirmBody>) =>
      apiSend('POST', '/api/employees/bulk-salary-changes', bulkConfirmResponseSchema, body),
  });

  function loadPreview(percentageBp: number, previous: Preview | null) {
    previewMutation.mutate(percentageBp, {
      onSuccess: ({ items }) => {
        setPreview({ items, percentageBp });
        setOverrides((current) =>
          previous ? keepUnaffectedOverrides(previous.items, items, current) : {},
        );
        setPage(0);
      },
      onError: (error) => {
        setAlert(error.message);
      },
    });
  }

  function onPreview(event: FormEvent) {
    event.preventDefault();
    const percentageBp = parsePercentageToBp(percentageText);
    if (percentageBp === null) {
      setPercentageError('Enter a percentage between 0.01 and 100, with at most two decimals');
      return;
    }
    setPercentageError(null);
    setAlert(null);
    loadPreview(percentageBp, null);
  }

  const summary = preview ? summarize(preview.items, overrides) : null;
  const dateError =
    effectiveDate === '' || effectiveDate > today ? 'Effective date cannot be in the future' : null;

  function onConfirm() {
    if (!preview || dateError) return;
    setAlert(null);
    const body = buildConfirmBody(preview.items, overrides, {
      percentageBp: preview.percentageBp,
      effectiveDate,
      note,
    });
    confirmMutation.mutate(body, {
      onSuccess: (result) => {
        toast.success(
          `Applied ${formatPercentageBp(preview.percentageBp)} to ${result.employeeCount} employees`,
        );
        onDone();
      },
      onError: (error) => {
        setAlert(error.message);
        if (error instanceof ApiError && error.status === 409) {
          toast.error('Salaries changed since the preview. The preview has been reloaded.');
          loadPreview(preview.percentageBp, preview);
        }
      },
    });
  }

  const pageItems = preview?.items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];
  const increaseText = summary?.increaseByCurrency
    .map(({ currencyCode, increaseMinor }) => formatMoney(increaseMinor, currencyCode))
    .join(' + ');

  return (
    <section
      aria-label="Apply percentage increase"
      className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Apply % increase</h2>
        <Button variant="ghost" size="icon" aria-label="Close bulk revision" onClick={onClose}>
          <X />
        </Button>
      </header>

      <form onSubmit={onPreview} noValidate className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="bulk-percentage">Percentage increase</Label>
          <div className="flex items-center gap-1">
            <Input
              id="bulk-percentage"
              inputMode="decimal"
              value={percentageText}
              aria-invalid={percentageError ? true : undefined}
              aria-describedby={percentageError ? 'bulk-percentage-error' : undefined}
              onChange={(event) => {
                setPercentageText(event.target.value);
              }}
              className="w-28 text-right"
            />
            <span className="text-sm text-text-secondary">%</span>
          </div>
        </div>
        <Button type="submit" disabled={previewMutation.isPending}>
          Preview
        </Button>
        {percentageError && (
          <p id="bulk-percentage-error" className="basis-full text-xs text-negative">
            {percentageError}
          </p>
        )}
      </form>

      {alert && (
        <p
          role="alert"
          className="rounded-sm border border-negative/40 bg-negative/5 p-2 text-sm text-negative"
        >
          {alert}
        </p>
      )}

      {previewMutation.isPending && !preview && (
        <div role="status" className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
          <span className="sr-only">Loading preview</span>
        </div>
      )}

      {preview && summary && (
        <>
          {preview.items.length === 0 ? (
            <p className="text-sm text-text-secondary">No active employees match this selection.</p>
          ) : (
            <>
              <p className="text-sm font-medium tabular-nums">
                {summary.count.toLocaleString('en-US')} employees · {summary.overriddenCount}{' '}
                overridden · total increase {increaseText}
              </p>

              {isDesktop ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface text-xs text-text-secondary">
                      <tr>
                        <th className="h-8 px-2 text-left font-medium">Employee</th>
                        <th className="h-8 px-2 text-left font-medium">Department · Level</th>
                        <th className="h-8 px-2 text-right font-medium">Current</th>
                        <th className="h-8 px-2 text-right font-medium">New amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item) => (
                        <tr key={item.employeeId} className="border-b border-border align-top">
                          <td className="px-2 py-1.5">{`${item.firstName} ${item.lastName}`}</td>
                          <td className="px-2 py-1.5 text-text-secondary">
                            {item.departmentName} · {item.levelCode}
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                            {formatMoney(item.currentAmountMinor, item.currencyCode)}
                          </td>
                          <td className="px-2 py-1">
                            <OverrideCell
                              item={item}
                              value={overrides[item.employeeId]}
                              onChange={(text) => {
                                setOverrides((current) => ({
                                  ...current,
                                  [item.employeeId]: text,
                                }));
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {pageItems.map((item) => (
                    <li key={item.employeeId} className="flex flex-col gap-1 py-2">
                      <span className="font-medium">{`${item.firstName} ${item.lastName}`}</span>
                      <span className="text-xs text-text-secondary">
                        {item.departmentName} · {item.levelCode} · now{' '}
                        {formatMoney(item.currentAmountMinor, item.currencyCode)}
                      </span>
                      <OverrideCell
                        item={item}
                        value={overrides[item.employeeId]}
                        onChange={(text) => {
                          setOverrides((current) => ({ ...current, [item.employeeId]: text }));
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>
                  {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + pageItems.length} of{' '}
                  {preview.items.length.toLocaleString('en-US')}
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous page"
                    disabled={page === 0}
                    onClick={() => {
                      setPage(page - 1);
                    }}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next page"
                    disabled={(page + 1) * PAGE_SIZE >= preview.items.length}
                    onClick={() => {
                      setPage(page + 1);
                    }}
                  >
                    <ChevronRight />
                  </Button>
                </span>
              </div>

              <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="bulk-date">Effective date</Label>
                  <Input
                    id="bulk-date"
                    type="date"
                    max={today}
                    value={effectiveDate}
                    aria-invalid={dateError ? true : undefined}
                    onChange={(event) => {
                      setEffectiveDate(event.target.value);
                    }}
                    className="w-40"
                  />
                </div>
                <div className="flex min-w-48 flex-1 flex-col gap-1">
                  <Label htmlFor="bulk-note">Note</Label>
                  <Input
                    id="bulk-note"
                    value={note}
                    maxLength={200}
                    onChange={(event) => {
                      setNote(event.target.value);
                    }}
                  />
                </div>
                <Button
                  onClick={onConfirm}
                  disabled={
                    summary.invalidCount > 0 || dateError !== null || confirmMutation.isPending
                  }
                >
                  {`Apply to ${summary.count.toLocaleString('en-US')} ${summary.count === 1 ? 'employee' : 'employees'}`}
                </Button>
                {dateError && <p className="basis-full text-xs text-negative">{dateError}</p>}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
