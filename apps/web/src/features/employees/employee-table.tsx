'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import type { EmployeeListItem } from '@acme/shared';
import { cn } from 'cn';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CountryFlag } from '@/components/ui/country-flag';
import { LevelBadge } from '@/components/ui/level-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { formatMoney } from '@/lib/money';
import { formatDate, useCountries } from '@/features/reference/use-reference';
import type { SortKey } from './list-filters';

export const HIDEABLE_COLUMNS = ['department', 'level', 'country', 'hireDate', 'salary'] as const;
export type HideableColumn = (typeof HIDEABLE_COLUMNS)[number];
export type ColumnVisibility = Record<HideableColumn, boolean>;
export const ALL_COLUMNS_VISIBLE: ColumnVisibility = {
  department: true,
  level: true,
  country: true,
  hireDate: true,
  salary: true,
};

type SortOrder = 'asc' | 'desc';

export interface EmployeeTableProps {
  items: EmployeeListItem[];
  sortBy: SortKey;
  sortOrder: SortOrder;
  onSort: (sortBy: SortKey) => void;
  /** Whether rows can be selected for a bulk revision at all. */
  selectable: boolean;
  /** Mobile only: checkboxes appear once the "Select" button has been tapped. */
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onSelectionChange: (next: ReadonlySet<number>) => void;
  columnVisibility: ColumnVisibility;
  onOpen: (id: number) => void;
  /** The list's own query string, carried on the detail link so the list behind the drawer keeps it. */
  detailQuery: string;
}

function fullName(item: EmployeeListItem) {
  return `${item.firstName} ${item.lastName}`;
}

export function detailHref(id: number, query: string) {
  return query ? `/employees/${id}?${query}` : `/employees/${id}`;
}

function SortButton({
  label,
  sortKey,
  sortBy,
  order,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sortBy: SortKey;
  order: SortOrder;
  onSort: (sortBy: SortKey) => void;
}) {
  const active = sortBy === sortKey;
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      aria-label={`Sort by ${label}`}
      onClick={() => {
        onSort(sortKey);
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm hover:text-text-primary',
        active && 'text-text-primary',
      )}
    >
      {label}
      <Icon className={cn('size-3', active && 'text-primary')} aria-hidden="true" />
    </button>
  );
}

function InactiveBadge() {
  return (
    <Badge variant="outline" className="border-inactive text-inactive">
      Inactive
    </Badge>
  );
}

/** The table column that a server sort key belongs to (name and job title share one column). */
function columnOf(sortKey: SortKey): string {
  return sortKey === 'name' || sortKey === 'jobTitle' ? 'employee' : sortKey;
}

function toSelectionState(ids: ReadonlySet<number>): RowSelectionState {
  return Object.fromEntries([...ids].map((id) => [String(id), true]));
}

function DesktopTable({
  items,
  sortBy,
  sortOrder,
  onSort,
  selectable,
  selectedIds,
  onSelectionChange,
  columnVisibility,
  onOpen,
  detailQuery,
}: EmployeeTableProps) {
  const countries = useCountries().data;
  const countryNames = useMemo(
    () => new Map((countries ?? []).map((country) => [country.code, country.name])),
    [countries],
  );

  const columns = useMemo<ColumnDef<EmployeeListItem>[]>(() => {
    const sortButton = (label: string, sortKey: SortKey) => (
      <SortButton
        label={label}
        sortKey={sortKey}
        sortBy={sortBy}
        order={sortOrder}
        onSort={onSort}
      />
    );
    const defs: ColumnDef<EmployeeListItem>[] = [];
    if (selectable) {
      defs.push({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all rows on this page"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="size-4 accent-primary"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${fullName(row.original)}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="size-4 accent-primary"
          />
        ),
      });
    }
    defs.push(
      {
        id: 'employee',
        header: () => (
          <span className="inline-flex items-center gap-3">
            {sortButton('Name', 'name')}
            {sortButton('Job title', 'jobTitle')}
          </span>
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <span className="flex items-center gap-2">
              <Avatar name={fullName(item)} />
              <Link
                href={detailHref(item.id, detailQuery)}
                title={item.email}
                className={cn(
                  'font-medium hover:underline',
                  item.status === 'active' && 'text-primary',
                )}
              >
                {fullName(item)}
              </Link>
              {item.status === 'inactive' && <InactiveBadge />}
              <span className="flex min-w-0 items-center gap-1 text-text-secondary">
                <span aria-hidden="true">·</span>
                <span className="max-w-48 truncate">{item.jobTitle}</span>
              </span>
            </span>
          );
        },
      },
      {
        id: 'department',
        header: () => sortButton('Department', 'department'),
        cell: ({ row }) => row.original.departmentName,
      },
      {
        id: 'level',
        header: () => sortButton('Level', 'level'),
        cell: ({ row }) => <LevelBadge code={row.original.levelCode} />,
      },
      {
        id: 'country',
        header: () => sortButton('Country', 'country'),
        cell: ({ row }) => (
          <CountryFlag
            code={row.original.countryCode}
            name={countryNames.get(row.original.countryCode)}
          />
        ),
      },
      {
        id: 'hireDate',
        header: () => sortButton('Hired', 'hireDate'),
        cell: ({ row }) => formatDate(row.original.hireDate),
      },
      {
        id: 'salary',
        header: () => sortButton('Salary', 'salary'),
        cell: ({ row }) => {
          const { salary } = row.original;
          return (
            <span className="inline-flex items-baseline gap-2">
              <span>{formatMoney(salary.amountMinor, salary.currencyCode)}</span>
              {salary.currencyCode !== 'USD' && (
                <span className="text-xs text-text-secondary">
                  {formatMoney(salary.amountBaseMinor, 'USD')}
                </span>
              )}
            </span>
          );
        },
      },
    );
    return defs;
  }, [selectable, sortBy, sortOrder, onSort, detailQuery, countryNames]);

  const rowSelection = useMemo(() => toSelectionState(selectedIds), [selectedIds]);

  // The table instance is only used inside this component, so the compiler skipping it is harmless.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
    manualSorting: true,
    manualPagination: true,
    state: {
      sorting: [{ id: columnOf(sortBy), desc: sortOrder === 'desc' }],
      columnVisibility,
      rowSelection,
    },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      onSelectionChange(
        new Set(
          Object.entries(next)
            .filter(([, selected]) => selected)
            .map(([id]) => Number(id)),
        ),
      );
    },
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="hover:bg-surface">
            {group.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return (
                <TableHead
                  key={header.id}
                  numeric={header.column.id === 'salary'}
                  className={header.column.id === 'select' ? 'w-8' : undefined}
                  aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            className={cn('cursor-pointer', row.original.status === 'inactive' && 'text-inactive')}
            onClick={(event) => {
              if ((event.target as Element).closest('a, button, input, label')) return;
              onOpen(row.original.id);
            }}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                numeric={cell.column.id === 'salary'}
                className={cn('whitespace-nowrap', cell.column.id === 'hireDate' && 'tabular-nums')}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CompactList({
  items,
  selectMode,
  selectedIds,
  onSelectionChange,
  detailQuery,
}: EmployeeTableProps) {
  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => {
        const body = (
          <>
            <Avatar name={fullName(item)} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{fullName(item)}</span>
                {item.status === 'inactive' && <InactiveBadge />}
              </span>
              <span className="text-xs text-text-secondary">
                {item.departmentName} · {item.levelCode}
              </span>
            </span>
            <span className="text-sm whitespace-nowrap tabular-nums">
              {formatMoney(item.salary.amountMinor, item.salary.currencyCode)}
            </span>
          </>
        );
        const rowClass = cn(
          'flex min-h-14 items-center gap-3 px-1 py-2',
          item.status === 'inactive' && 'text-inactive',
        );
        return (
          <li key={item.id}>
            {selectMode ? (
              <label className={cn(rowClass, 'cursor-pointer')}>
                <input
                  type="checkbox"
                  aria-label={`Select ${fullName(item)}`}
                  checked={selectedIds.has(item.id)}
                  onChange={() => {
                    toggle(item.id);
                  }}
                  className="size-5 accent-primary"
                />
                {body}
              </label>
            ) : (
              <Link href={detailHref(item.id, detailQuery)} className={rowClass}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function EmployeeTable(props: EmployeeTableProps) {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopTable {...props} /> : <CompactList {...props} />;
}
