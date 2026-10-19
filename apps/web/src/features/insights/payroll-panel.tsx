'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { toPayrollChartRows, type PayrollChartRow } from './chart-data';
import { ChartSkeleton, Panel, PanelError } from './panel';
import { usePayroll, type PayrollGroupBy } from './use-insights';

function PayrollTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: PayrollChartRow }[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-sm border border-border bg-background p-2 text-xs shadow-md">
      <p className="font-medium">{row.label}</p>
      <p className="tabular-nums">{formatMoney(row.totalBaseMinor, 'USD', { fraction: false })}</p>
      <p className="text-text-secondary">{row.headcount.toLocaleString('en-US')} employees</p>
    </div>
  );
}

function PayrollChart({ groupBy, title }: { groupBy: PayrollGroupBy; title: string }) {
  const { data, error, isPending, refetch } = usePayroll(groupBy);

  return (
    <Panel
      title={title}
      description={
        data
          ? `${formatMoney(data.totalBaseMinor, 'USD', { fraction: false })} across ${data.headcount.toLocaleString('en-US')} active employees`
          : undefined
      }
    >
      {isPending ? (
        <ChartSkeleton label={`Loading payroll by ${groupBy}`} />
      ) : error ? (
        <PanelError
          message={error.message}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : (
        <div className="h-64 w-full" role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={toPayrollChartRows(data)} margin={{ left: 16, right: 8, bottom: 24 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                interval={0}
                tick={{ fontSize: 11 }}
                label={{
                  value: groupBy === 'country' ? 'Country' : 'Department',
                  position: 'insideBottom',
                  offset: -12,
                  fontSize: 12,
                }}
              />
              <YAxis
                width={72}
                tickFormatter={(value: number) => formatMoneyCompact(value, 'USD')}
                tick={{ fontSize: 12 }}
                label={{
                  value: 'Total payroll (USD)',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 12,
                }}
              />
              <Tooltip content={<PayrollTooltip />} cursor={{ fill: 'var(--surface)' }} />
              <Bar
                dataKey="totalBaseMinor"
                name="Total payroll"
                fill="var(--accent)"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

export function PayrollPanels() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <PayrollChart groupBy="country" title="Payroll by country" />
      <PayrollChart groupBy="department" title="Payroll by department" />
    </div>
  );
}
