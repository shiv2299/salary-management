'use client';

import { useFxAsOfDate } from '@/features/reference/use-reference';
import { DistributionPanel } from './distribution-panel';
import { HeadlineTiles } from './headline-tiles';
import { OutliersPanel } from './outliers-panel';
import { PayrollChangeCard } from './payroll-change-card';
import { PayrollTrendCard } from './payroll-trend-card';
import { RecentChangesPanel } from './recent-changes-panel';

export function InsightsPage() {
  const fxDate = useFxAsOfDate();

  return (
    // Insights sits on the canvas colour edge to edge, so it reaches past the shell's padding.
    <div className="-mx-4 -my-4 flex flex-1 flex-col gap-4 bg-canvas px-4 py-4 md:-mx-8 md:-my-6 md:px-8 md:py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-text-primary">Insights</h1>
        <p className="text-xs text-text-secondary">
          {`Active employees · USD at FX rates of ${fxDate ?? '…'} · Past years use the same rates`}
        </p>
      </header>
      <HeadlineTiles />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PayrollTrendCard />
        <PayrollChangeCard />
      </div>
      <DistributionPanel />
      <OutliersPanel />
      <RecentChangesPanel />
    </div>
  );
}
