'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { StepIndicator } from '@/components/ui/step-indicator';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { todayUtc } from '@/lib/clock';
import { parsePercentageToBp } from '@/lib/money';
import { useCountries, useDepartments, useLevels } from '@/features/reference/use-reference';
import { BulkSetup } from './bulk-setup';
import { bulkDefaultNote, listHrefFrom, selectionFromParams } from './selection';
import { useBulkPreview, useBulkSummary } from './use-bulk-revision';

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

  useBulkPreview(target, percentageBp);
  const who = useBulkSummary(target, percentageBp, []).data;

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

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col items-start gap-2">
        {backLink}
        <h1 className="text-xl font-semibold text-text-primary">Bulk salary revision</h1>
        <StepIndicator steps={STEPS} current={1} />
      </header>
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[320px_minmax(0,1fr)] md:items-start">
        <BulkSetup
          target={target}
          listParams={listParams}
          who={who}
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
          <p className="text-sm text-text-secondary">Choose an increase to see the review.</p>
        </section>
      </div>
    </div>
  );
}
