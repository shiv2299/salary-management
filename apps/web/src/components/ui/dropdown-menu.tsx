'use client';

import * as React from 'react';
import { cn } from 'cn';
import { DropdownMenu as Primitive } from 'radix-ui';

const DropdownMenu = Primitive.Root;
const DropdownMenuTrigger = Primitive.Trigger;

function DropdownMenuContent({
  className,
  align = 'end',
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align={align}
        sideOffset={4}
        className={cn(
          'z-50 min-w-48 rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        'flex min-h-11 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none data-[highlighted]:bg-surface md:min-h-8',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={cn('px-2 py-1.5 text-xs text-text-secondary', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
};
