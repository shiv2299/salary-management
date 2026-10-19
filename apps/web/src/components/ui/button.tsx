import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

// 44px touch targets below the md breakpoint (docs/design.md §7), dense 32px from md up.
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border border-transparent text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border-border bg-background text-text-primary hover:bg-surface',
        ghost: 'text-text-primary hover:bg-surface',
        destructive: 'border-negative bg-background text-negative hover:bg-negative/10',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-3 md:h-8',
        sm: 'h-11 px-2.5 md:h-7 md:text-[13px]',
        icon: 'size-11 md:size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
