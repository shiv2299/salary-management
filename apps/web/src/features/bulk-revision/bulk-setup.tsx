'use client';

import type { BulkSummary } from '@acme/shared';
import { useMemo } from 'react';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatPercentageBp, parsePercentageToBp } from '@/lib/money';
import {
  formatDate,
  useCountries,
  useDepartments,
  useLevels,
} from '@/features/reference/use-reference';
import { filterChips, filtersFromParams } from '../employees/list-filters';
import type { BulkTarget } from './selection';
import { useLatestBulkRevision } from './use-bulk-revision';

const QUICK_PERCENTAGES = [3, 4, 5, 8, 10];

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="text-xs font-medium tracking-wide text-text-secondary uppercase">{children}</h2>
  );
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  return message ? (
    <p id={id} role="alert" className="text-xs text-negative">
      {message}
    </p>
  ) : null;
}

export interface BulkSetupProps {
  target: BulkTarget;
  listParams: URLSearchParams;
  who: BulkSummary | undefined;
  /** The count failed and nothing is loaded; offers a retry. */
  whoFailed: boolean;
  onRetryWho: () => void;
  percentageText: string;
  percentageError: string | null;
  onPercentageText: (text: string) => void;
  effectiveDate: string;
  today: string;
  dateError: string | null;
  onEffectiveDate: (date: string) => void;
  note: string;
  onNote: (note: string) => void;
}

export function BulkSetup({
  target,
  listParams,
  who,
  whoFailed,
  onRetryWho,
  percentageText,
  percentageError,
  onPercentageText,
  effectiveDate,
  today,
  dateError,
  onEffectiveDate,
  note,
  onNote,
}: BulkSetupProps) {
  const countries = useCountries().data;
  const departments = useDepartments().data;
  const levels = useLevels().data;
  const latest = useLatestBulkRevision().data?.latest;

  const chips = useMemo(() => {
    const filters = filtersFromParams(listParams);
    const found = filterChips(filters, {
      countries: countries ?? [],
      departments: departments ?? [],
      levels: levels ?? [],
    })
      .filter((chip) => chip.key !== 'status')
      .map((chip) => chip.label);
    if (filters.search) found.push(`Search: ${filters.search}`);
    return found;
  }, [listParams, countries, departments, levels]);

  const pickedByHand = 'employeeIds' in target;
  const percentageBp = parsePercentageToBp(percentageText);

  return (
    <aside aria-label="Setup" className="flex flex-col gap-5 bg-surface p-4">
      <section className="flex flex-col gap-2">
        <SectionLabel>Who</SectionLabel>
        {whoFailed ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-negative">
            <span>Could not count the people selected.</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetryWho}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="text-sm font-medium text-text-primary">
            {who ? `${plural(who.headcount, 'person', 'people')}, active only` : 'Counting people…'}
          </p>
        )}
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((label) => (
              <Chip key={label} label={label} />
            ))}
          </div>
        ) : null}
        {pickedByHand ? (
          <p className="text-xs text-text-secondary">Picked by hand from this list.</p>
        ) : chips.length === 0 ? (
          <p className="text-xs text-text-secondary">Everyone active</p>
        ) : null}
        {who && who.byDepartment.length > 0 ? (
          <ul aria-label="By department" className="flex flex-col gap-1 text-sm">
            {who.byDepartment.map((row) => (
              <li key={row.departmentName} className="flex justify-between gap-2">
                <span className="text-text-primary">{row.departmentName}</span>
                <span className="text-text-secondary tabular-nums">
                  {row.headcount.toLocaleString('en-US')}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel>Increase</SectionLabel>
        <Label htmlFor="bulk-percentage">Percentage increase</Label>
        <div className="relative">
          <Input
            id="bulk-percentage"
            inputMode="decimal"
            autoComplete="off"
            value={percentageText}
            aria-invalid={percentageError !== null}
            aria-describedby="bulk-percentage-error"
            onChange={(event) => {
              onPercentageText(event.target.value);
            }}
            className="pr-7"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-text-secondary"
          >
            %
          </span>
        </div>
        <FieldError id="bulk-percentage-error" message={percentageError} />
        <div role="group" aria-label="Quick percentages" className="flex flex-wrap gap-1.5">
          {QUICK_PERCENTAGES.map((value) => (
            <Button
              key={value}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={percentageBp === value * 100}
              onClick={() => {
                onPercentageText(String(value));
              }}
              className="aria-pressed:border-primary aria-pressed:bg-accent-tint aria-pressed:text-primary"
            >
              {value}%
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel>Effective date</SectionLabel>
        <Label htmlFor="bulk-effective-date" className="sr-only">
          Effective date
        </Label>
        <Input
          id="bulk-effective-date"
          type="date"
          max={today}
          value={effectiveDate}
          aria-invalid={dateError !== null}
          aria-describedby="bulk-date-error"
          onChange={(event) => {
            onEffectiveDate(event.target.value);
          }}
        />
        <FieldError id="bulk-date-error" message={dateError} />
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel>Note</SectionLabel>
        <Label htmlFor="bulk-note" className="sr-only">
          Note
        </Label>
        <Input
          id="bulk-note"
          value={note}
          maxLength={200}
          aria-describedby="bulk-note-hint"
          onChange={(event) => {
            onNote(event.target.value);
          }}
        />
        <p id="bulk-note-hint" className="text-xs text-text-secondary">
          Shown in each person&apos;s salary history.
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <SectionLabel>Last bulk revision</SectionLabel>
        {latest ? (
          <>
            <p className="text-sm text-text-primary">
              {`${formatDate(latest.effectiveDate)} · ${formatPercentageBp(latest.percentageBp)} · ${plural(latest.employeeCount, 'person', 'people')}`}
            </p>
            {latest.note ? <p className="text-xs text-text-secondary">{latest.note}</p> : null}
          </>
        ) : (
          <p className="text-sm text-text-secondary">No bulk revision yet.</p>
        )}
      </section>
    </aside>
  );
}
