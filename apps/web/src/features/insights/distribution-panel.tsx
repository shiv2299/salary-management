'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { toDistributionChartRows, type DistributionChartRow } from './chart-data';
import { ChartSkeleton, Panel, PanelError } from './panel';
import { useDistribution, type DistributionGroupBy } from './use-insights';

const GROUPINGS: { value: DistributionGroupBy; label: string }[] = [
  { value: 'country', label: 'Country' },
  { value: 'department', label: 'Department' },
  { value: 'level', label: 'Level' },
];

function DistributionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: DistributionChartRow }[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const { stats } = row;
  const lines: [string, number][] = [
    ['Max', stats.max],
    ['p90', stats.p90],
    ['p75', stats.p75],
    ['Median', stats.median],
    ['Mean', stats.mean],
    ['p25', stats.p25],
    ['Min', stats.min],
  ];
  return (
    <div className="rounded-sm border border-border bg-background p-2 text-xs shadow-md">
      <p className="font-medium">
        {row.label} · {row.headcount.toLocaleString('en-US')} employees
      </p>
      {lines.map(([name, value]) => (
        <p key={name} className="flex justify-between gap-4 tabular-nums">
          <span className="text-text-secondary">{name}</span>
          <span>{formatMoney(value, 'USD', { fraction: false })}</span>
        </p>
      ))}
    </div>
  );
}

export function DistributionPanel() {
  const [groupBy, setGroupBy] = useState<DistributionGroupBy>('country');
  const { data, error, isPending, refetch } = useDistribution(groupBy);
  const rows = data ? toDistributionChartRows(data) : [];

  return (
    <Panel
      title="Pay distribution"
      description="Annual base pay of active employees. Each bar spans minimum to maximum, with the box from p25 to p75 and the shade change at the median."
      actions={
        <SegmentedControl
          label="Group distribution by"
          value={groupBy}
          options={GROUPINGS}
          onChange={setGroupBy}
        />
      }
    >
      {isPending ? (
        <ChartSkeleton label="Loading distribution" />
      ) : error ? (
        <PanelError
          message={error.message}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : (
        <>
          <div className="h-72 w-full" role="img" aria-label={`Pay distribution by ${groupBy}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, bottom: 24 }}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) => formatMoneyCompact(value, 'USD')}
                  label={{
                    value: 'Annual base pay (USD)',
                    position: 'insideBottom',
                    offset: -12,
                    fontSize: 12,
                  }}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={96}
                  tick={{ fontSize: 12 }}
                  label={{
                    value: groupBy[0]?.toUpperCase() + groupBy.slice(1),
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 12,
                  }}
                />
                <Tooltip content={<DistributionTooltip />} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="offset"
                  stackId="range"
                  fill="transparent"
                  legendType="none"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="lowerWhisker"
                  stackId="range"
                  name="Min to p25"
                  fill="var(--accent)"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="lowerBox"
                  stackId="range"
                  name="p25 to median"
                  fill="var(--accent)"
                  fillOpacity={0.65}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="upperBox"
                  stackId="range"
                  name="Median to p75"
                  fill="var(--accent)"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="upperWhisker"
                  stackId="range"
                  name="p75 to max"
                  fill="var(--accent)"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs text-text-secondary">
                <tr>
                  <th className="h-8 px-2 text-left font-medium">
                    {GROUPINGS.find((g) => g.value === groupBy)?.label}
                  </th>
                  {['Headcount', 'Min', 'p25', 'Median', 'Mean', 'p75', 'p90', 'Max'].map(
                    (heading) => (
                      <th key={heading} className="h-8 px-2 text-right font-medium">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, label, stats }) => (
                  <tr key={key} className="border-b border-border">
                    <td className="h-8 px-2">{label}</td>
                    <td className="px-2 text-right tabular-nums">
                      {stats.headcount.toLocaleString('en-US')}
                    </td>
                    {[
                      stats.min,
                      stats.p25,
                      stats.median,
                      stats.mean,
                      stats.p75,
                      stats.p90,
                      stats.max,
                    ].map((value, index) => (
                      <td key={index} className="px-2 text-right whitespace-nowrap tabular-nums">
                        {formatMoney(value, 'USD', { fraction: false })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
