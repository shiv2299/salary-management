'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useCountries, useDepartments, useLevels } from '@/features/reference/use-reference';
import type { ListFilters } from './list-filters';

interface Props {
  filters: ListFilters;
  onChange: (patch: Partial<ListFilters>) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

function SearchBox({ filters, onChange }: Props) {
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
    <form onSubmit={submit} role="search" className="relative min-w-0 flex-1 md:max-w-72">
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

function Dropdowns({ filters, onChange, stacked }: Props & { stacked?: boolean }) {
  const countries = useCountries().data ?? [];
  const departments = useDepartments().data ?? [];
  const levels = useLevels().data ?? [];

  function field(label: string, control: React.ReactNode) {
    return (
      <div className={stacked ? 'flex flex-col gap-1' : 'flex items-center gap-1.5'}>
        <Label className={stacked ? undefined : 'sr-only'}>{label}</Label>
        {control}
      </div>
    );
  }

  return (
    <>
      {field(
        'Country',
        <Select
          aria-label="Country"
          value={filters.country[0] ?? ''}
          onChange={(event) => {
            onChange({ country: event.target.value ? [event.target.value] : [] });
          }}
        >
          <option value="">All countries</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </Select>,
      )}
      {field(
        'Department',
        <Select
          aria-label="Department"
          value={filters.department[0] ?? ''}
          onChange={(event) => {
            onChange({ department: event.target.value ? [Number(event.target.value)] : [] });
          }}
        >
          <option value="">All departments</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>,
      )}
      {field(
        'Level',
        <Select
          aria-label="Level"
          value={filters.level[0] ?? ''}
          onChange={(event) => {
            onChange({ level: event.target.value ? [Number(event.target.value)] : [] });
          }}
        >
          <option value="">All levels</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.code}
            </option>
          ))}
        </Select>,
      )}
      {field(
        'Status',
        <Select
          aria-label="Status"
          value={filters.status}
          onChange={(event) => {
            onChange({ status: event.target.value as ListFilters['status'] });
          }}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All statuses</option>
        </Select>,
      )}
    </>
  );
}

/** The count of non-default dropdown filters, shown on the mobile "Filters" button. */
function activeFilterCount(filters: ListFilters) {
  return (
    Number(filters.country.length > 0) +
    Number(filters.department.length > 0) +
    Number(filters.level.length > 0) +
    Number(filters.status !== 'active')
  );
}

export function EmployeeFilters({ filters, onChange }: Props) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);

  if (isDesktop) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox filters={filters} onChange={onChange} />
        <Dropdowns filters={filters} onChange={onChange} />
      </div>
    );
  }

  const count = activeFilterCount(filters);
  return (
    <div className="flex items-center gap-2">
      <SearchBox filters={filters} onChange={onChange} />
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <SlidersHorizontal />
        Filters
        {count > 0 && <Badge>{count}</Badge>}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-3 p-4">
          <SheetTitle className="text-base font-semibold">Filters</SheetTitle>
          <SheetDescription className="sr-only">Filter the employee list</SheetDescription>
          <div className="flex flex-col gap-3 overflow-y-auto">
            <Dropdowns filters={filters} onChange={onChange} stacked />
          </div>
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Done
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
