'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import type { EmployeeListItem } from '@acme/shared';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
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
import { formatDate } from '@/features/reference/use-reference';
import type { ListFilters } from './list-filters';

type SortKey = ListFilters['sortBy'];

export interface EmployeeTableProps {
  items: EmployeeListItem[];
  sortBy: SortKey;
  sortOrder: 'asc' | 'desc';
  onSort: (sortBy: SortKey) => void;
  /** Whether rows can be selected for a bulk revision at all. */
  selectable: boolean;
  /** Mobile only: checkboxes appear once the "Select" button has been tapped. */
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onTogglePage: (ids: number[]) => void;
  /** The list's own query string, carried on the detail link so the list behind the drawer keeps it. */
  detailQuery: string;
}

function fullName(item: EmployeeListItem) {
  return `${item.firstName} ${item.lastName}`;
}

function detailHref(id: number, query: string) {
  return query ? `/employees/${id}?${query}` : `/employees/${id}`;
}

function SortHeader({
  label,
  sortKey,
  active,
  order,
  onSort,
  numeric,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  order: 'asc' | 'desc';
  onSort: (sortBy: SortKey) => void;
  numeric?: boolean;
}) {
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      numeric={numeric}
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        onClick={() => {
          onSort(sortKey);
        }}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm hover:text-text-primary',
          active && 'text-text-primary',
        )}
      >
        {label}
        <Icon className="size-3" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function InactiveBadge() {
  return (
    <Badge variant="outline" className="border-inactive text-inactive">
      Inactive
    </Badge>
  );
}

function DesktopTable(props: EmployeeTableProps) {
  const { items, sortBy, sortOrder, onSort, selectable, selectedIds, onToggle, onTogglePage } =
    props;
  const ids = items.map((item) => item.id);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-surface">
          {selectable && (
            <TableHead className="w-8">
              <input
                type="checkbox"
                aria-label="Select all rows on this page"
                checked={allSelected}
                onChange={() => {
                  onTogglePage(ids);
                }}
                className="size-4 accent-primary"
              />
            </TableHead>
          )}
          <SortHeader
            label="Name"
            sortKey="name"
            active={sortBy === 'name'}
            order={sortOrder}
            onSort={onSort}
          />
          <TableHead>Job title</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Level</TableHead>
          <TableHead>Country</TableHead>
          <SortHeader
            label="Hired"
            sortKey="hireDate"
            active={sortBy === 'hireDate'}
            order={sortOrder}
            onSort={onSort}
          />
          <TableHead numeric>Salary</TableHead>
          <SortHeader
            label="Salary (USD)"
            sortKey="salary"
            active={sortBy === 'salary'}
            order={sortOrder}
            onSort={onSort}
            numeric
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            className={cn(item.status === 'inactive' && 'text-inactive')}
            aria-selected={selectedIds.has(item.id)}
          >
            {selectable && (
              <TableCell>
                <input
                  type="checkbox"
                  aria-label={`Select ${fullName(item)}`}
                  checked={selectedIds.has(item.id)}
                  onChange={() => {
                    onToggle(item.id);
                  }}
                  className="size-4 accent-primary"
                />
              </TableCell>
            )}
            <TableCell>
              <span className="flex items-center gap-2">
                <Link
                  href={detailHref(item.id, props.detailQuery)}
                  title={item.email}
                  className={cn(
                    'font-medium hover:underline',
                    item.status === 'active' && 'text-primary',
                  )}
                >
                  {fullName(item)}
                </Link>
                {item.status === 'inactive' && <InactiveBadge />}
              </span>
            </TableCell>
            <TableCell className="max-w-48 truncate">{item.jobTitle}</TableCell>
            <TableCell>{item.departmentName}</TableCell>
            <TableCell>{item.levelCode}</TableCell>
            <TableCell>{item.countryCode}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {formatDate(item.hireDate)}
            </TableCell>
            <TableCell numeric className="whitespace-nowrap">
              {formatMoney(item.salary.amountMinor, item.salary.currencyCode)}
            </TableCell>
            <TableCell numeric className="whitespace-nowrap">
              {formatMoney(item.salary.amountBaseMinor, 'USD')}
            </TableCell>
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
  onToggle,
  detailQuery,
}: EmployeeTableProps) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => {
        const body = (
          <>
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
                    onToggle(item.id);
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
