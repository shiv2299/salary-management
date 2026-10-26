'use client';

import { recentChangesQuerySchema } from '@acme/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, type ReactNode } from 'react';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { RowsSkeleton } from '@/components/ui/chart-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { REASON_LABELS } from '@/features/employees/reason-labels';
import { ChangeEntry, changeEntryKey } from './change-entry';
import { RANGE_OPTIONS, type YearRange } from './chart-data';
import { useRecentChanges, type RecentChangeReason } from './use-insights';

const PATH = '/insights/changes';
const PAGE_SIZE = 25;

interface ChangesFilters {
  range: YearRange;
  year: number | null;
  reason: RecentChangeReason | null;
  /** 1-based, as it appears in the URL. */
  page: number;
}

const REASONS = Object.keys(REASON_LABELS) as RecentChangeReason[];

function filtersFromParams(params: URLSearchParams): ChangesFilters {
  const range = params.get('range');
  const reason = params.get('reason');
  const year = recentChangesQuerySchema.shape.year.safeParse(params.get('year') ?? undefined);
  const page = Number(params.get('page'));
  return {
    range: RANGE_OPTIONS.find((option) => option.value === range)?.value ?? '3y',
    year: year.success ? (year.data ?? null) : null,
    reason: REASONS.find((value) => value === reason) ?? null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Only what differs from the defaults goes in the URL. */
function paramsFromFilters(filters: ChangesFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range !== '3y') params.set('range', filters.range);
  if (filters.year !== null) params.set('year', String(filters.year));
  if (filters.reason !== null) params.set('reason', filters.reason);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

const SELECT_CLASS =
  'h-11 rounded-sm border border-border bg-background px-1 text-sm text-text-primary md:h-8 md:text-xs';

function LabelledSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-secondary">
      {label}
      <select
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={SELECT_CLASS}
      >
        {children}
      </select>
    </label>
  );
}

export function ChangesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramsText = searchParams.toString();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(paramsText)), [paramsText]);
  const { data, error, isPending, isPlaceholderData, refetch } = useRecentChanges({
    range: filters.range,
    year: filters.year,
    reason: filters.reason,
    offset: (filters.page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const write = useCallback(
    (next: ChangesFilters) => {
      const query = paramsFromFilters(next).toString();
      router.replace(query ? `${PATH}?${query}` : PATH, { scroll: false });
    },
    [router],
  );

  // Any filter change means a different list, so it starts again at the first page.
  const update = (patch: Partial<Omit<ChangesFilters, 'page'>>) => {
    write({ ...filters, ...patch, page: 1 });
  };

  const filtered = filters.range !== '3y' || filters.year !== null || filters.reason !== null;
  const available = data?.availableYears ?? [];
  const years =
    filters.year === null || available.includes(filters.year)
      ? available
      : [filters.year, ...available].sort((a, b) => b - a);

  return (
    // Like Insights, the page sits on the canvas colour edge to edge, past the shell's padding.
    <div className="-mx-4 -my-4 flex flex-1 flex-col gap-4 bg-canvas px-4 py-4 md:-mx-8 md:-my-6 md:px-8 md:py-6">
      <header className="flex flex-col items-start gap-1">
        <Link
          href="/insights"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline md:min-h-0"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to insights
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Salary changes</h1>
      </header>
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {filters.year === null ? (
            <SegmentedControl
              label="Range"
              value={filters.range}
              options={RANGE_OPTIONS}
              onChange={(range) => {
                update({ range });
              }}
            />
          ) : (
            <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
              {`In ${filters.year}`}
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  update({ year: null });
                }}
              >
                Clear year
              </Button>
            </span>
          )}
          <LabelledSelect
            label="Reason"
            value={filters.reason ?? ''}
            onChange={(value) => {
              update({ reason: REASONS.find((reason) => reason === value) ?? null });
            }}
          >
            <option value="">All reasons</option>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {REASON_LABELS[reason]}
              </option>
            ))}
          </LabelledSelect>
          <LabelledSelect
            label="Year"
            value={filters.year === null ? '' : String(filters.year)}
            onChange={(value) => {
              update({ year: value === '' ? null : Number(value) });
            }}
          >
            <option value="">Any year</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </LabelledSelect>
        </div>
        {isPending ? (
          <RowsSkeleton rows={8} label="Loading salary changes" />
        ) : error ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p className="text-negative">{error.message}</p>
            <Button
              variant="outline"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-8 text-sm">
            <p className="text-text-secondary">No salary changes match these filters.</p>
            {filtered && (
              <Button
                variant="link"
                onClick={() => {
                  router.replace(PATH, { scroll: false });
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <ul className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
              {data.items.map((entry) => (
                <ChangeEntry key={changeEntryKey(entry)} entry={entry} />
              ))}
            </ul>
            <Pagination
              page={filters.page}
              pageSize={PAGE_SIZE}
              total={data.total}
              onPage={(page) => {
                write({ ...filters, page });
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
