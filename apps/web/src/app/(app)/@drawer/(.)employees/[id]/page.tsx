import { notFound } from 'next/navigation';
import { EmployeeDrawer } from '@/features/employees/employee-drawer';

export default async function EmployeeDrawerPage({ params }: PageProps<'/employees/[id]'>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <EmployeeDrawer id={id} />;
}
