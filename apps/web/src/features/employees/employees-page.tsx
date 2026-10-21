'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { todayUtc } from '@/lib/clock';
import { useCountries, useDepartments, useLevels } from '@/features/reference/use-reference';
import { BulkRevisionPanel, type BulkTarget } from './bulk-revision-panel';
import { EmployeeFilters } from './employee-filters';
import { EmployeeTable } from './employee-table';
import { ExportMenu } from './export-menu';
import { NewEmployeeSheet } from './new-employee-sheet';
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  bulkFilterFrom,
  filtersFromParams,
  paramsFromFilters,
  type ListFilters,
} from './list-filters';
import { useEmployeeList } from './use-employees';

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

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

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

  const hasActiveFilters =
    filters.search !== undefined ||
    filters.country.length > 0 ||
    filters.department.length > 0 ||
    filters.level.length > 0 ||
    filters.status !== 'active';

  const selectionCount = allMatching ? (data?.total ?? 0) : selectedIds.size;

  function toggle(id: number) {
    setAllMatching(false);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage(ids: number[]) {
    setAllMatching(false);
    setSelectedIds((current) => {
      const next = new Set(current);
      const allIn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allIn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
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
        <h1 className="text-lg font-semibold text-text-primary">
          Employees
          {data && (
            <span className="ml-2 text-sm font-normal text-text-secondary tabular-nums">
              {data.total.toLocaleString('en-US')}
            </span>
          )}
        </h1>
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

      <EmployeeFilters filters={filters} onChange={update} />

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
          {hasActiveFilters && (
            <Button
              variant="link"
              onClick={() => {
                clearSelection();
                writeFilters(DEFAULT_FILTERS);
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
            onToggle={toggle}
            onTogglePage={togglePage}
            detailQuery={paramsText}
          />
        </div>
      )}

      {data && data.total > 0 && (
        <Pagination
          page={filters.page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPage={(page) => {
            update({ page });
          }}
        />
      )}
    </div>
  );
}
