import { Suspense } from 'react';
import { EmployeesPage } from '@/features/employees/employees-page';

export default function Page() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense>
      <EmployeesPage />
    </Suspense>
  );
}
