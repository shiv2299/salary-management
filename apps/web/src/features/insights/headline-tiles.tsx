'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { formatMoneyCompact, formatPercentageBp } from '@/lib/money';
import { averageRaiseVsBefore, changeVsYearAgo, countVsBefore, countVsYearAgo } from './answers';
import { useAttention, usePayrollTrend, useRaiseStats } from './use-insights';

const MISSING = '—';

/** The figure once its request has answered, a placeholder while it is on its way, "—" if it failed. */
function figure<T>(query: { data?: T; isError: boolean }, show: (data: T) => ReactNode): ReactNode {
  if (query.data !== undefined) return show(query.data);
  if (query.isError) return MISSING;
  return <Skeleton className="h-7 w-20" />;
}

export function HeadlineTiles() {
  const trend = usePayrollTrend();
  const raises = useRaiseStats();
  const attention = useAttention();
  const summary = trend.data?.summary;
  const current = raises.data?.trailing.current;
  const previous = raises.data?.trailing.previous;
  const outside = attention.data ? attention.data.outlierAbove + attention.data.outlierBelow : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <StatTile
        label="Annual payroll"
        value={figure(trend, (data) =>
          formatMoneyCompact(data.summary.totalBaseMinor, data.baseCurrency),
        )}
        hint={summary && changeVsYearAgo(summary.changeBp)}
      />
      <StatTile
        label="Active headcount"
        value={figure(trend, (data) => data.summary.headcount.toLocaleString('en-US'))}
        hint={summary && countVsYearAgo(summary.headcount, summary.yearAgoHeadcount)}
      />
      <StatTile
        label="Average raise, last 12 months"
        value={figure(raises, (data) => {
          const bp = data.trailing.current.averageRaiseBp;
          return bp === null ? MISSING : formatPercentageBp(bp);
        })}
        hint={
          current &&
          previous &&
          averageRaiseVsBefore(current.averageRaiseBp, previous.averageRaiseBp)
        }
      />
      <StatTile
        label="Promotions, last 12 months"
        value={figure(raises, (data) =>
          data.trailing.current.promotionCount.toLocaleString('en-US'),
        )}
        hint={current && previous && countVsBefore(current.promotionCount, previous.promotionCount)}
      />
      <StatTile
        label="Paid outside peer range"
        tone={outside > 0 ? 'warning' : 'neutral'}
        value={figure(attention, () => outside.toLocaleString('en-US'))}
        hint={
          attention.data &&
          `${formatPercentageBp(attention.data.outsidePeerRangeShareBp)} of active employees`
        }
      />
    </div>
  );
}
