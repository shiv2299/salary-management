'use client';

import * as React from 'react';
import { cn } from 'cn';
import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';

const Sheet = Dialog.Root;
const SheetTitle = Dialog.Title;
const SheetDescription = Dialog.Description;

/** A slide-over: full-screen below md, a fixed-width panel from the right at md and up. */
function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof Dialog.Content> & { side?: 'right' | 'bottom' }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <Dialog.Content
        className={cn(
          'fixed z-50 flex flex-col bg-background shadow-lg outline-none',
          side === 'right' &&
            'inset-0 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right md:inset-y-0 md:right-0 md:left-auto md:w-[560px] md:border-l md:border-border',
          side === 'bottom' &&
            'inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg border-t border-border data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
          className,
        )}
        {...props}
      >
        {children}
        <Dialog.Close
          aria-label="Close"
          className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-sm text-text-secondary hover:bg-surface md:size-8"
        >
          <X className="size-4" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export { Sheet, SheetContent, SheetDescription, SheetTitle };
