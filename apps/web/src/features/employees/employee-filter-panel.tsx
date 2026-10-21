'use client';

import type { EmployeeFacets } from '@acme/shared';
import { PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckboxGroup } from '@/components/ui/checkbox-group';
import { CountryFlag } from '@/components/ui/country-flag';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useStoredFlag } from '@/hooks/use-stored-flag';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { useCountries, useDepartments, useLevels } from '@/features/reference/use-reference';
import {
  activeFilterCount,
  statusChecks,
  statusFromChecks,
  type ListFilters,
} from './list-filters';

interface Props {
  filters: ListFilters;
  onChange: (patch: Partial<ListFilters>) => void;
  facets: EmployeeFacets | undefined;
}

const COLLAPSED_KEY = 'employees.filters.collapsed';

/** A group's count for one value: blank until the facets arrive, then 0 for a value with no matches. */
function countOf<T>(group: { value: T; count: number }[] | undefined, value: T) {
  if (!group) return undefined;
  return group.find((entry) => entry.value === value)?.count ?? 0;
}

function FilterGroups({ filters, onChange, facets }: Props) {
  const countries = useCountries().data ?? [];
  const departments = useDepartments().data ?? [];
  const levels = useLevels().data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <CheckboxGroup
        legend="Status"
        selected={statusChecks(filters.status)}
        onChange={(next) => {
          onChange({ status: statusFromChecks(next) });
        }}
        options={[
          { value: 'active', label: 'Active', count: countOf(facets?.status, 'active') },
          { value: 'inactive', label: 'Inactive', count: countOf(facets?.status, 'inactive') },
        ]}
      />
      <CheckboxGroup
        legend="Country"
        selected={filters.country}
        onChange={(next) => {
          onChange({ country: next });
        }}
        options={countries.map((country) => ({
          value: country.code,
          label: <CountryFlag code={country.code} name={country.name} />,
          count: countOf(facets?.country, country.code),
        }))}
      />
      <CheckboxGroup
        legend="Department"
        selected={filters.department}
        onChange={(next) => {
          onChange({ department: next });
        }}
        options={departments.map((department) => ({
          value: department.id,
          label: department.name,
          count: countOf(facets?.department, department.id),
        }))}
      />
      <CheckboxGroup
        legend="Level"
        selected={filters.level}
        onChange={(next) => {
          onChange({ level: next });
        }}
        options={levels.map((level) => ({
          value: level.id,
          label: level.code,
          count: countOf(facets?.level, level.id),
        }))}
      />
    </div>
  );
}

export function EmployeeFilterPanel({ filters, onChange, facets }: Props) {
  const isDesktop = useIsDesktop();
  const [collapsed, setCollapsed] = useStoredFlag(COLLAPSED_KEY, false);
  const [open, setOpen] = useState(false);

  if (isDesktop) {
    if (collapsed) {
      return (
        <div className="shrink-0">
          <Button
            variant="outline"
            onClick={() => {
              setCollapsed(false);
            }}
          >
            <PanelLeftOpen />
            Show filters
          </Button>
        </div>
      );
    }
    return (
      <aside aria-label="Filters" className="w-[200px] shrink-0 rounded-md bg-surface p-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Filters</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Hide filters"
            title="Hide filters"
            onClick={() => {
              setCollapsed(true);
            }}
          >
            <PanelLeftClose />
          </Button>
        </div>
        <FilterGroups filters={filters} onChange={onChange} facets={facets} />
      </aside>
    );
  }

  const count = activeFilterCount(filters);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <SlidersHorizontal />
        {count > 0 ? `Filters (${count})` : 'Filters'}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-3 p-4">
          <SheetTitle className="text-base font-semibold">Filters</SheetTitle>
          <SheetDescription className="sr-only">Filter the employee list</SheetDescription>
          <div className="overflow-y-auto">
            <FilterGroups filters={filters} onChange={onChange} facets={facets} />
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
    </>
  );
}
