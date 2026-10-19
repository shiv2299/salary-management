import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {description && <p className="text-xs text-text-secondary">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Axis-shaped placeholder: a y-axis rail, bars of varying length, and an x-axis rule. */
export function ChartSkeleton({ label }: { label: string }) {
  const widths = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2'];
  return (
    <div role="status" className="flex h-64 gap-3">
      <Skeleton className="h-full w-px" />
      <div className="flex flex-1 flex-col justify-around">
        {widths.map((width) => (
          <Skeleton key={width} className={`h-6 ${width}`} />
        ))}
        <Skeleton className="h-px w-full" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function RowsSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 text-sm">
      <p className="text-negative">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
