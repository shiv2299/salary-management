import * as React from 'react';
import { cn } from 'cn';

// Square corners, compact rows, sticky header (docs/design.md §5, §6).
function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <table
      data-slot="table"
      className={cn('w-full border-collapse text-sm', className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('sticky top-0 z-10 bg-surface', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border hover:bg-surface', className)} {...props} />;
}

function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<'th'> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        'h-8 border-b border-border px-2 text-xs font-medium whitespace-nowrap text-text-secondary',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<'td'> & { numeric?: boolean }) {
  return (
    <td
      className={cn('h-8 px-2 py-1', numeric && 'text-right tabular-nums', className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
