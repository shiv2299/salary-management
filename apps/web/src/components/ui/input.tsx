import * as React from 'react';
import { cn } from 'cn';

const fieldClasses =
  'h-11 w-full min-w-0 rounded-sm border border-input bg-background px-2.5 text-sm text-text-primary placeholder:text-text-secondary disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-60 aria-invalid:border-negative md:h-8';

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldClasses, className)} {...props} />;
}

/** A native select: reliable on touch devices and for keyboards, styled like the other fields. */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="select" className={cn(fieldClasses, 'pr-6', className)} {...props} />;
}

export { Input, Select };
