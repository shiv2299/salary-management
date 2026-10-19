import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { EmployeeDetailView } from './employee-detail';

/** The full-page fallback for direct navigation or a refresh at the detail URL. */
export function EmployeeDetailPage({ id }: { id: number }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
      <Link
        href="/employees"
        className="inline-flex h-11 w-fit items-center gap-1 text-sm text-primary hover:underline md:h-8"
      >
        <ArrowLeft className="size-4" />
        Employees
      </Link>
      <div className="rounded-lg border border-border">
        <EmployeeDetailView id={id} />
      </div>
    </div>
  );
}
