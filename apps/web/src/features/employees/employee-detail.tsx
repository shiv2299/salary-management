'use client';

import type { EmployeeDetail, UpdateEmployeeBody } from '@acme/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { todayUtc } from '@/lib/clock';
import { formatMoney } from '@/lib/money';
import { REASON_LABELS } from '@/features/insights/recent-changes-panel';
import {
  formatDate,
  useCountries,
  useDepartments,
  useFxAsOfLabel,
} from '@/features/reference/use-reference';
import { InlineField } from './inline-field';
import { SalaryChangeForm } from './salary-change-form';
import { useEmployee, useSetEmployeeStatus, useUpdateEmployee } from './use-employee';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-text-secondary uppercase">{title}</h3>
      {children}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4 p-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
      <span className="sr-only">Loading employee</span>
    </div>
  );
}

function Details({ employee }: { employee: EmployeeDetail }) {
  const update = useUpdateEmployee(employee.id);
  const departments = useDepartments().data ?? [];
  const countries = useCountries().data ?? [];

  async function save(patch: UpdateEmployeeBody) {
    try {
      await update.mutateAsync(patch);
      toast.success('Saved');
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not save';
    }
  }

  const country = countries.find((item) => item.code === employee.countryCode);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <InlineField
        label="First name"
        display={employee.firstName}
        value={employee.firstName}
        onSave={(firstName) => save({ firstName })}
      />
      <InlineField
        label="Last name"
        display={employee.lastName}
        value={employee.lastName}
        onSave={(lastName) => save({ lastName })}
      />
      <InlineField
        label="Email"
        display={employee.email}
        value={employee.email}
        onSave={(email) => save({ email })}
      />
      <InlineField
        label="Job title"
        display={employee.jobTitle}
        value={employee.jobTitle}
        onSave={(jobTitle) => save({ jobTitle })}
      />
      <InlineField
        label="Department"
        display={employee.departmentName}
        value={String(employee.departmentId)}
        options={departments.map((department) => ({
          value: String(department.id),
          label: department.name,
        }))}
        onSave={(departmentId) => save({ departmentId: Number(departmentId) })}
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-text-secondary">Level</span>
        <span className="text-sm">{employee.levelCode}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-text-secondary">Country</span>
        <span className="text-sm">{country?.name ?? employee.countryCode}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-text-secondary">Hired</span>
        <span className="text-sm">{formatDate(employee.hireDate)}</span>
      </div>
    </div>
  );
}

function StatusAction({ employee }: { employee: EmployeeDetail }) {
  const setStatus = useSetEmployeeStatus(employee.id);
  const [confirming, setConfirming] = useState(false);
  const name = `${employee.firstName} ${employee.lastName}`;

  if (employee.status === 'inactive') {
    return (
      <Button
        variant="outline"
        disabled={setStatus.isPending}
        onClick={() => {
          setStatus.mutate('reactivate', {
            onSuccess: () => toast.success(`${name} reactivated`),
            onError: (error) => toast.error(error.message),
          });
        }}
      >
        Reactivate
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Deactivate
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle className="text-base font-semibold">Deactivate {name}?</DialogTitle>
          <DialogDescription className="text-sm text-text-secondary">
            They disappear from the default list and from insights. Their salary history is kept and
            you can reactivate them at any time.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={setStatus.isPending}
              onClick={() => {
                setStatus.mutate('deactivate', {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.success(`${name} deactivated`);
                  },
                  onError: (error) => {
                    setConfirming(false);
                    toast.error(error.message);
                  },
                });
              }}
            >
              Deactivate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function History({ employee }: { employee: EmployeeDetail }) {
  return (
    <ol aria-label="Salary history" className="flex flex-col">
      {employee.history.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm"
        >
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{REASON_LABELS[entry.reason]}</Badge>
            <span className="tabular-nums">
              {formatMoney(entry.amountMinor, entry.currencyCode)}
            </span>
            <span className="text-xs text-text-secondary">
              {entry.levelCode} · {entry.countryCode}
              {entry.batchId !== null && ' · bulk revision'}
            </span>
          </span>
          <span className="text-xs text-text-secondary">{formatDate(entry.effectiveDate)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The one employee detail component, rendered in the drawer and on the full page. */
export function EmployeeDetailView({ id, today }: { id: number; today?: string }) {
  const { data: employee, error, isPending, refetch } = useEmployee(id);
  const fxLabel = useFxAsOfLabel();

  if (isPending) return <DetailSkeleton />;

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
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
    );
  }

  const { salary } = employee;
  const name = `${employee.firstName} ${employee.lastName}`;

  return (
    <div className="flex flex-col gap-6 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2 pr-10">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {name}
            {employee.status === 'inactive' && (
              <Badge variant="outline" className="border-inactive text-inactive">
                Inactive
              </Badge>
            )}
          </h2>
          <p className="text-sm text-text-secondary">
            {employee.jobTitle} · {employee.departmentName}
          </p>
        </div>
        <StatusAction employee={employee} />
      </header>

      <Section title="Current salary">
        <p className="flex flex-col gap-0.5">
          <span className="text-xl font-semibold tabular-nums">
            {formatMoney(salary.amountMinor, salary.currencyCode)} {salary.currencyCode}
          </span>
          {salary.currencyCode !== 'USD' && (
            <span className="text-xs text-text-secondary tabular-nums">
              {formatMoney(salary.amountBaseMinor, 'USD')} USD{fxLabel ? ` · ${fxLabel}` : ''}
            </span>
          )}
          <span className="text-xs text-text-secondary">
            Effective {formatDate(salary.effectiveDate)}
          </span>
        </p>
      </Section>

      <Section title="Details">
        <Details employee={employee} />
      </Section>

      <Section title="Record a salary change">
        <SalaryChangeForm employee={employee} today={today ?? todayUtc()} />
      </Section>

      <Section title="Salary history">
        <History employee={employee} />
      </Section>
    </div>
  );
}
