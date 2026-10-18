'use client';

import { Badge } from '@/components/ui/badge';
import { useHealth } from './use-health';

export function HealthStatus() {
  const { data, error, isPending } = useHealth();

  if (isPending) {
    return (
      <div role="status" className="flex items-center gap-2">
        <div className="h-5 w-12 animate-pulse rounded-sm bg-border" />
        <span className="sr-only">Checking API health</span>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col gap-1">
        <Badge variant="destructive">Unreachable</Badge>
        <p className="text-text-secondary">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={data.database === 'ok' ? 'positive' : 'destructive'}>
        {data.status === 'ok' ? 'ok' : 'error'}
      </Badge>
      <p className="text-text-secondary">Database: {data.database}</p>
    </div>
  );
}
