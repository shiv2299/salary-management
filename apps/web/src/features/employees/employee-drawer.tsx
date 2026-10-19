'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { EmployeeDetailView } from './employee-detail';

/**
 * The intercepted detail route: a slide-over above the list, which stays mounted underneath so its
 * scroll position, filters and page are untouched. Closing goes back in history.
 */
export function EmployeeDrawer({ id }: { id: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.back();
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetTitle className="sr-only">Employee detail</SheetTitle>
        <SheetDescription className="sr-only">
          View and edit an employee and record salary changes.
        </SheetDescription>
        <EmployeeDetailView id={id} />
      </SheetContent>
    </Sheet>
  );
}
