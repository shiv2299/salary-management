'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { todayUtc } from '@/lib/clock';
import { EmployeeForm } from './employee-form';

/** New employee form in a drawer (docs/design.md §5), then straight on to the new record. */
export function NewEmployeeSheet({ today }: { today?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const query = useSearchParams().toString();

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        <Plus />
        New employee
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto p-4">
          <SheetTitle className="pr-10 text-lg font-semibold">New employee</SheetTitle>
          <SheetDescription className="mb-4 text-sm text-text-secondary">
            Creates the employee with their first salary. Country and level change later only
            through a relocation or promotion.
          </SheetDescription>
          <EmployeeForm
            today={today ?? todayUtc()}
            onCreated={(id) => {
              setOpen(false);
              router.push(query ? `/employees/${id}?${query}` : `/employees/${id}`);
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
