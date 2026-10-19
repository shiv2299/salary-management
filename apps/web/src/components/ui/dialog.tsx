'use client';

import * as React from 'react';
import { cn } from 'cn';
import { Dialog as DialogPrimitive } from 'radix-ui';

const Dialog = DialogPrimitive.Root;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-lg outline-none',
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle };
