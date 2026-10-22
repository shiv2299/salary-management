'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { BulkOverride } from '@acme/shared';
import { Button } from '@/components/ui/button';
import { StepIndicator } from '@/components/ui/step-indicator';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ApiError } from '@/lib/api';
import { todayUtc } from '@/lib/clock';
import { parsePercentageToBp } from '@/lib/money';
import {
  formatDate,
  useCountries,
  useDepartments,
  useLevels,
} from '@/features/reference/use-reference';
import { BulkReview } from './bulk-review';
import { ConfirmDialog } from './confirm-dialog';
import {
  buildConfirmBody,
  countInvalid,
  keepUnaffectedOverrides,
  overridesForSummary,
  type Overrides,
} from './bulk-state';
import { BulkSetup } from './bulk-setup';
import { bulkDefaultNote, listHrefFrom, selectionFromParams } from './selection';
import { useBulkPreview, useBulkSummary, useConfirmBulkRevision } from './use-bulk-revision';

const STEPS = ['Choose people', 'Set increase & review', 'Confirm'];
const DEBOUNCE_MS = 400;

export function BulkRevisionPage({ today }: { today?: string }) {
  const searchParams = useSearchParams();
  const paramsText = searchParams.toString();
  const listParams = useMemo(() => new URLSearchParams(paramsText), [paramsText]);
  const target = useMemo(() => selectionFromParams(listParams), [listParams]);
  const backHref = listHrefFrom(listParams);
  const todayText = today ?? todayUtc();

  const countries = useCountries().data;
  const departments = useDepartments().data;
  const levels = useLevels().data;

  const [percentageText, setPercentageText] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayText);
  // Null until the user types; the note then follows the selection instead of being copied once.
  const [typedNote, setTypedNote] = useState<string | null>(null);

  const debouncedPercentage = useDebouncedValue(percentageText, DEBOUNCE_MS);
  const percentageBp = parsePercentageToBp(debouncedPercentage);

  const [overrides, setOverrides] = useState<Overrides>({});
  const onOverride = useCallback((employeeId: number, text: string | undefined) => {
    setOverrides((current) => {
      const next = { ...current };
      if (text === undefined) delete next[employeeId];
      else next[employeeId] = text;
      return next;
    });
  }, []);

  const preview = useBulkPreview(target, percentageBp);
  const previewItems = preview.data?.items;
  // Compared as text so the effect that waits for a pause stays stable.
  const overridesJson = JSON.stringify(
    previewItems ? overridesForSummary(previewItems, overrides) : [],
  );
  const debouncedOverridesJson = useDebouncedValue(overridesJson, DEBOUNCE_MS);
  const summaryOverrides = useMemo(
    () => (percentageBp === null ? [] : (JSON.parse(debouncedOverridesJson) as BulkOverride[])),
    [debouncedOverridesJson, percentageBp],
  );
  const summary = useBulkSummary(target, percentageBp, summaryOverrides);
  const who = summary.data;

  const defaultNote =
    target && countries && departments && levels
      ? bulkDefaultNote(target, { countries, departments, levels })
      : '';
  const note = typedNote ?? defaultNote;

  const percentageError =
    percentageText.trim() !== '' && parsePercentageToBp(percentageText) === null
      ? 'Enter a percentage between 0.01 and 100, with at most two decimals'
      : null;
  const dateError =
    effectiveDate === ''
      ? 'Choose an effective date'
      : effectiveDate > todayText
        ? 'Effective date cannot be in the future'
        : null;

  const queryClient = useQueryClient();
  const confirm = useConfirmBulkRevision();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ count: number; effectiveDate: string } | null>(null);

  const invalidCount = previewItems ? countInvalid(previewItems, overrides) : 0;
  // The preview answers the percentage as typed: no pause pending, no older answer on show.
  const previewCurrent =
    preview.data !== undefined &&
    !preview.isPlaceholderData &&
    !preview.isFetching &&
    !preview.isError &&
    percentageText === debouncedPercentage;
  const canReview =
    previewCurrent && preview.data.items.length > 0 && invalidCount === 0 && dateError === null;
  const summaryCurrent =
    summary.data !== undefined &&
    !summary.isPlaceholderData &&
    !summary.isFetching &&
    debouncedOverridesJson === overridesJson;

  const openDialog = () => {
    setConfirmError(null);
    setDialogOpen(true);
  };

  const apply = () => {
    if (!preview.data || !previewCurrent) return;
    const before = preview.data.items;
    // The percentage the shown preview was fetched with, so the batch matches the amounts sent.
    const meta = { percentageBp: preview.data.percentageBp, effectiveDate, note };
    confirm.mutate(buildConfirmBody(before, overrides, meta), {
      onSuccess: (result) => {
        setDialogOpen(false);
        setApplied({ count: result.employeeCount, effectiveDate: result.effectiveDate });
        for (const key of ['employees', 'insights', 'bulk-revision']) {
          void queryClient.invalidateQueries({ queryKey: [key] });
        }
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setDialogOpen(false);
          toast.error('Salaries changed since the preview. The preview has been reloaded.');
          void preview.refetch().then((result) => {
            const after = result.data?.items;
            if (after) setOverrides(keepUnaffectedOverrides(before, after, overrides));
          });
          return;
        }
        setConfirmError(error.message);
      },
    });
  };

  const backLink = (
    <Link
      href={backHref}
      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline md:min-h-0"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back to employees
    </Link>
  );

  if (!target) {
    return (
      <div className="flex flex-col items-start gap-3 p-4 md:p-6">
        {backLink}
        <h1 className="text-xl font-semibold text-text-primary">Bulk salary revision</h1>
        <p className="text-sm text-text-primary">No one is selected for this revision.</p>
        <p className="text-sm text-text-secondary">
          Choose people on the employees list, then select Apply % increase.
        </p>
      </div>
    );
  }

  if (applied) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <header className="flex flex-col items-start gap-2">
          <h1 className="text-xl font-semibold text-text-primary">Bulk salary revision</h1>
          <StepIndicator steps={STEPS} current={3} />
        </header>
        <section className="flex flex-col items-start gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Revision applied</h2>
          <p className="text-sm text-text-primary">
            {`${applied.count} ${applied.count === 1 ? 'raise' : 'raises'} recorded, effective ${formatDate(applied.effectiveDate)}.`}
          </p>
          <div className="flex gap-4 text-sm font-medium">
            <Link
              href={backHref}
              className="inline-flex min-h-11 items-center text-primary hover:underline md:min-h-0"
            >
              View employees
            </Link>
            <Link
              href="/insights"
              className="inline-flex min-h-11 items-center text-primary hover:underline md:min-h-0"
            >
              View insights
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col items-start gap-2">
        {backLink}
        <h1 className="text-xl font-semibold text-text-primary">Bulk salary revision</h1>
        <StepIndicator steps={STEPS} current={dialogOpen ? 2 : 1} />
      </header>
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[320px_minmax(0,1fr)] md:items-start">
        <BulkSetup
          target={target}
          listParams={listParams}
          who={who}
          whoFailed={summary.isError && !summary.data}
          onRetryWho={() => {
            void summary.refetch();
          }}
          percentageText={percentageText}
          percentageError={percentageError}
          onPercentageText={setPercentageText}
          effectiveDate={effectiveDate}
          today={todayText}
          dateError={dateError}
          onEffectiveDate={setEffectiveDate}
          note={note}
          onNote={setTypedNote}
        />
        <section aria-label="Review" className="min-w-0 bg-background">
          <BulkReview
            preview={preview}
            summary={summary}
            summaryOverrides={summaryOverrides}
            overrides={overrides}
            onOverride={onOverride}
            percentageChosen={percentageBp !== null}
          />
        </section>
      </div>
      <footer className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-background px-4 py-3 md:-mx-6 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-text-secondary">
            Nothing is saved until you confirm the changes.
          </p>
          {invalidCount > 0 ? (
            <p className="text-sm text-negative">Fix the highlighted amounts before confirming.</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-primary hover:underline md:min-h-0"
          >
            Cancel
          </Link>
          <Button className="w-full md:w-auto" disabled={!canReview} onClick={openDialog}>
            {`Review & confirm ${preview.data?.items.length ?? 0} ${preview.data?.items.length === 1 ? 'change' : 'changes'} →`}
          </Button>
        </div>
      </footer>
      {preview.data ? (
        <ConfirmDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          percentageBp={preview.data.percentageBp}
          headcount={preview.data.items.length}
          effectiveDate={effectiveDate}
          note={note}
          revision={summary.data?.revision ?? undefined}
          figuresCurrent={previewCurrent && summaryCurrent}
          pending={confirm.isPending}
          error={confirmError}
          onApply={apply}
        />
      ) : null}
    </div>
  );
}
