'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { todayUtc } from '@/lib/clock';
import { useCountries, useDepartments, useLevels } from '@/features/reference/use-reference';
import { BulkRevisionPanel, type BulkTarget } from './bulk-revision-panel';
import { ColumnsMenu } from './columns-menu';
import { EmployeeFilterPanel } from './employee-filter-panel';
import {
  ALL_COLUMNS_VISIBLE,
  EmployeeTable,
  detailHref,
  type ColumnVisibility,
} from './employee-table';
import { ExportMenu } from './export-menu';
import { NewEmployeeSheet } from './new-employee-sheet';
import {
  DEFAULT_FILTERS,
  PAGE_SIZES,
  bulkFilterFrom,
  filterChips,
  filtersFromParams,
  hasActiveFilters,
  paramsFromFilters,
  type ListFilters,
  type PageSize,
} from './list-filters';
import { useEmployeeFacets, useEmployeeList } from './use-employees';

const SEARCH_DEBOUNCE_MS = 300;

function SearchBox({
  filters,
  onChange,
}: {
  filters: ListFilters;
  onChange: (patch: Partial<ListFilters>) => void;
}) {
  const [text, setText] = useState(filters.search ?? '');
  const [seenSearch, setSeenSearch] = useState(filters.search);

  // Keep the box in step when the URL changes underneath it (clear filters, back button), but not
  // when the change is the one this box just made.
  if (filters.search !== seenSearch) {
    setSeenSearch(filters.search);
    if ((filters.search ?? '') !== text.trim()) setText(filters.search ?? '');
  }

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === (filters.search ?? '')) return;
    const timer = setTimeout(() => {
      onChange({ search: trimmed || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text, filters.search, onChange]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onChange({ search: text.trim() || undefined });
  }

  return (
    <form onSubmit={submit} role="search" className="relative w-full min-w-0 md:w-80">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-secondary"
      />
      <Input
        type="search"
        aria-label="Search employees"
        placeholder="Search name, email or job title"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
        className="pl-8"
      />
    </form>
  );
}

function TableSkeleton() {
  return (
    <div role="status" className="flex flex-col">
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="flex h-8 items-center gap-3 border-b border-border px-2">
          <Skeleton className="h-3 w-4" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="hidden h-3 w-24 md:block" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      ))}
      <span className="sr-only">Loading employees</span>
    </div>
  );
}

export function EmployeesPage({ today }: { today?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  const countries = useCountries().data;
  const departments = useDepartments().data;
  const levels = useLevels().data;

  const paramsText = searchParams.toString();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(paramsText)), [paramsText]);
  const { data, error, isPending, isPlaceholderData, refetch } = useEmployeeList(filters);
  const facets = useEmployeeFacets(filters).data;

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(ALL_COLUMNS_VISIBLE);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAllMatching(false);
  }, []);

  const writeFilters = useCallback(
    (next: ListFilters) => {
      const query = paramsFromFilters(next).toString();
      router.replace(query ? `/employees?${query}` : '/employees', { scroll: false });
    },
    [router],
  );

  // A changed filter or sort means a different set of rows, so a selection no longer describes it.
  const update = useCallback(
    (patch: Partial<ListFilters>) => {
      const isPaging = Object.keys(patch).length === 1 && 'page' in patch;
      if (!isPaging) clearSelection();
      writeFilters({ ...filters, ...patch, page: patch.page ?? 1 });
    },
    [filters, writeFilters, clearSelection],
  );

  const onSort = useCallback(
    (sortBy: ListFilters['sortBy']) => {
      update({
        sortBy,
        sortOrder: filters.sortBy === sortBy && filters.sortOrder === 'asc' ? 'desc' : 'asc',
      });
    },
    [filters.sortBy, filters.sortOrder, update],
  );

  // Back to the default list, but a chosen page size is a preference, not a filter.
  const clearAll = useCallback(() => {
    clearSelection();
    writeFilters({ ...DEFAULT_FILTERS, pageSize: filters.pageSize });
  }, [clearSelection, writeFilters, filters.pageSize]);

  const filtered = hasActiveFilters(filters);
  const chips = filterChips(filters, {
    countries: countries ?? [],
    departments: departments ?? [],
    levels: levels ?? [],
  });

  const selectionCount = allMatching ? (data?.total ?? 0) : selectedIds.size;

  function changeSelection(next: ReadonlySet<number>) {
    setAllMatching(false);
    setSelectedIds(next);
  }

  const bulkTarget: BulkTarget = allMatching
    ? { filter: bulkFilterFrom(filters) }
    : { employeeIds: [...selectedIds] };

  const defaultNote = allMatching
    ? [
        ...filters.department.map(
          (id) => departments?.find((department) => department.id === id)?.name,
        ),
        ...filters.level.map((id) => levels?.find((level) => level.id === id)?.code),
        ...filters.country.map((code) => countries?.find((country) => country.code === code)?.name),
      ]
        .filter(Boolean)
        .join(', ') || 'All matching employees'
    : 'Selected employees';

  if (bulkOpen) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold text-text-primary">Employees</h1>
        <BulkRevisionPanel
          target={bulkTarget}
          defaultNote={defaultNote}
          today={today ?? todayUtc()}
          onClose={() => {
            setBulkOpen(false);
          }}
          onDone={() => {
            setBulkOpen(false);
            clearSelection();
            setSelectMode(false);
            void queryClient.invalidateQueries({ queryKey: ['employees'] });
            void queryClient.invalidateQueries({ queryKey: ['insights'] });
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-text-primary">Employees</h1>
        <div className="flex items-center gap-2">
          {!isDesktop && (
            <Button
              variant="outline"
              onClick={() => {
                if (selectMode) clearSelection();
                setSelectMode(!selectMode);
              }}
            >
              {selectMode ? 'Done' : 'Select'}
            </Button>
          )}
          <ExportMenu filters={filters} />
          <NewEmployeeSheet today={today} />
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
        <div className="flex md:contents">
          <EmployeeFilterPanel filters={filters} onChange={update} facets={facets} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox filters={filters} onChange={update} />
            {chips.map((chip) => (
              <Chip
                key={chip.key}
                label={chip.label}
                onRemove={() => {
                  update(chip.remove);
                }}
              />
            ))}
            {filtered && (
              <Button variant="link" size="sm" onClick={clearAll}>
                Clear all
              </Button>
            )}
            <div className="ml-auto flex items-center gap-3">
              {data && (
                <span className="text-sm text-text-secondary tabular-nums">
                  {filtered && facets
                    ? `${data.total.toLocaleString('en-US')} of ${facets.statusTotal.toLocaleString('en-US')}`
                    : `${data.total.toLocaleString('en-US')} employees`}
                </span>
              )}
              <ColumnsMenu visibility={columnVisibility} onChange={setColumnVisibility} />
            </div>
          </div>

          {selectionCount > 0 && (
            <section
              aria-label="Selection"
              className="flex flex-wrap items-center gap-3 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
            >
              <span className="font-medium">
                {allMatching
                  ? `All ${selectionCount.toLocaleString('en-US')} matching selected`
                  : `${selectionCount.toLocaleString('en-US')} selected`}
              </span>
              {!allMatching && data && data.total > selectionCount && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setAllMatching(true);
                  }}
                >
                  {`Select all ${data.total.toLocaleString('en-US')} matching this filter`}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setBulkOpen(true);
                }}
              >
                Apply % increase
              </Button>
            </section>
          )}

          {isPending ? (
            <TableSkeleton />
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
              <p className="text-text-secondary">No employees match these filters</p>
              {filtered && (
                <Button
                  variant="link"
                  onClick={() => {
                    clearAll();
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
              <EmployeeTable
                items={data.items}
                sortBy={filters.sortBy}
                sortOrder={filters.sortOrder}
                onSort={onSort}
                selectable
                selectMode={selectMode}
                selectedIds={allMatching ? new Set(data.items.map((item) => item.id)) : selectedIds}
                onSelectionChange={changeSelection}
                columnVisibility={columnVisibility}
                onOpen={(id) => {
                  router.push(detailHref(id, paramsText), { scroll: false });
                }}
                detailQuery={paramsText}
              />
            </div>
          )}

          {data && data.total > 0 && (
            <Pagination
              page={filters.page}
              pageSize={filters.pageSize}
              total={data.total}
              onPage={(page) => {
                update({ page });
              }}
              pageSizeOptions={PAGE_SIZES}
              onPageSize={(pageSize) => {
                update({ pageSize: pageSize as PageSize, page: 1 });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
