'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { BulkRevisionPage } from './bulk-revision-page';

/**
 * The intercepted revision route: a wide slide-over above the list, which stays mounted underneath
 * with its filters, page and selection. Closing goes back in history. A click outside does not
 * close it, so a stray click cannot discard the percentage and hand edits.
 */
export function BulkRevisionSheet({ today }: { today?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    router.back();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <SheetContent
        className="overflow-y-auto md:w-[min(960px,calc(100vw-48px))]"
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <SheetTitle className="sr-only">Bulk salary revision</SheetTitle>
        <SheetDescription className="sr-only">
          Set a percentage increase for the selected employees, review each new salary and confirm.
        </SheetDescription>
        <BulkRevisionPage today={today} onClose={close} />
      </SheetContent>
    </Sheet>
  );
}
