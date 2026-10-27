'use client';

import { useState } from 'react';
import { useFxAsOfDate } from '@/features/reference/use-reference';
import { AttentionCard } from './attention-card';
import { HeadlineTiles } from './headline-tiles';
import { LevelBandsCard } from './level-bands-card';
import { PayrollChangeCard } from './payroll-change-card';
import { PayrollTrendCard } from './payroll-trend-card';
import { RaisesCard } from './raises-card';
import { RecentChangesCard } from './recent-changes-card';

export function InsightsPage() {
  const fxDate = useFxAsOfDate();
  // The calendar year chosen in the raises card, for the recent changes to follow.
  const [changesYear, setChangesYear] = useState<number | null>(null);

  return (
    // Insights sits on the canvas colour edge to edge, so it reaches past the shell's padding.
    <div className="-mx-4 -my-4 flex flex-1 flex-col gap-4 bg-canvas px-4 py-4 md:-mx-8 md:-my-6 md:px-8 md:py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-text-primary">Insights</h1>
        <p className="text-xs text-text-secondary">
          {`Figures for today cover active employees; trends include people who have since left · USD at FX rates of ${fxDate ?? '…'} · Past years use the same rates`}
        </p>
      </header>
      <HeadlineTiles />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PayrollTrendCard />
        <PayrollChangeCard />
        <RaisesCard onSelectYear={setChangesYear} />
        <LevelBandsCard />
        <AttentionCard />
        <RecentChangesCard
          year={changesYear}
          onClearYear={() => {
            setChangesYear(null);
          }}
        />
      </div>
    </div>
  );
}
