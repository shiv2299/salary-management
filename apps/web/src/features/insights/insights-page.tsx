'use client';

import { useFxAsOfLabel } from '@/features/reference/use-reference';
import { DistributionPanel } from './distribution-panel';
import { OutliersPanel } from './outliers-panel';
import { PayrollPanels } from './payroll-panel';
import { RecentChangesPanel } from './recent-changes-panel';

export function InsightsPage() {
  const fxLabel = useFxAsOfLabel();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-text-primary">Insights</h1>
        <p className="text-xs text-text-secondary">
          Active employees only. All amounts in USD{fxLabel ? ` · ${fxLabel}` : ''}
        </p>
      </div>
      <DistributionPanel />
      <PayrollPanels />
      <OutliersPanel />
      <RecentChangesPanel />
    </div>
  );
}
