import { notFound } from 'next/navigation';
import { EmployeeDetailPage } from '@/features/employees/employee-detail-page';

export default async function Page({ params }: PageProps<'/employees/[id]'>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <EmployeeDetailPage id={id} />;
}
