'use client';

import type { EmployeeDetail, UpdateEmployeeBody } from '@acme/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { todayUtc } from '@/lib/clock';
import { formatDate, useCountries, useDepartments } from '@/features/reference/use-reference';
import { EmployeeHeader } from './employee-header';
import { InlineField } from './inline-field';
import { SalaryChangeForm } from './salary-change-form';
import { SalaryHistoryList } from './salary-history-list';
import { SalarySummary } from './salary-summary';
import { useEmployee, useUpdateEmployee } from './use-employee';

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

/** The one employee detail component, rendered in the drawer and on the full page. */
export function EmployeeDetailView({ id, today }: { id: number; today?: string }) {
  const { data: employee, error, isPending, refetch } = useEmployee(id);

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

  return (
    <div className="flex flex-col gap-4 p-4">
      <EmployeeHeader employee={employee} />
      <SalarySummary employee={employee} />
      <Tabs defaultValue={employee.status === 'active' ? 'change' : 'details'}>
        <TabsList>
          <TabsTrigger value="change">Change salary</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="history">History ({employee.history.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="change">
          <SalaryChangeForm employee={employee} today={today ?? todayUtc()} />
        </TabsContent>
        <TabsContent value="details">
          <Details employee={employee} />
        </TabsContent>
        <TabsContent value="history">
          <SalaryHistoryList employee={employee} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
