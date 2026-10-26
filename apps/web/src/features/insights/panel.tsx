import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export { ChartSkeleton, RowsSkeleton } from '@/components/ui/chart-card';

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
