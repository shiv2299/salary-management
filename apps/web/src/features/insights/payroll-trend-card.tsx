'use client';

import type { PayrollTrendResponse } from '@acme/shared';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/ui/chart-card';
import { ChartLegend } from '@/components/ui/chart-legend';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { payrollTrendAnswer } from './answers';
import { RANGE_OPTIONS, trendPointsInRange, type YearRange } from './chart-data';
import { AXIS_LINE, AXIS_TICK, TooltipBox, seriesColor, wholeTick } from './chart-style';
import { usePayrollTrend } from './use-insights';

type Group = 'total' | 'country' | 'department';
type TrendPoint = PayrollTrendResponse['points'][number];

const GROUP_OPTIONS: { value: Group; label: string }[] = [
  { value: 'total', label: 'Total' },
  { value: 'country', label: 'Country' },
  { value: 'department', label: 'Department' },
];

const CAPTION = "Annual payroll at each year end and today, in USD at today's FX rates.";

/** The y-axis width of the payroll chart; the headcount strip leaves the same margin so points line up. */
const VALUE_AXIS_WIDTH = 64;

function pointLabel(point: TrendPoint): string {
  return point.isToday ? 'Today' : String(point.year);
}

function groupsOf(point: TrendPoint, group: Exclude<Group, 'total'>) {
  return group === 'country' ? point.byCountry : point.byDepartment;
}

function TrendTooltip({
  active,
  payload,
  group,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
  group: Group;
  currencyCode: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <TooltipBox title={pointLabel(point)}>
      <p className="tabular-nums">
        {formatMoney(point.totalBaseMinor, currencyCode, { fraction: false })}
      </p>
      {group !== 'total' &&
        groupsOf(point, group).map((entry) => (
          <p key={entry.key} className="text-text-secondary tabular-nums">
            {entry.label}: {formatMoney(entry.totalBaseMinor, currencyCode, { fraction: false })}
          </p>
        ))}
    </TooltipBox>
  );
}

function HeadcountTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <TooltipBox title={pointLabel(point)}>
      <p className="tabular-nums">{point.headcount.toLocaleString('en-US')} people</p>
    </TooltipBox>
  );
}

function TrendTable({
  points,
  group,
  currencyCode,
}: {
  points: TrendPoint[];
  group: Group;
  currencyCode: string;
}) {
  const columns = group === 'total' || !points[0] ? [] : groupsOf(points[0], group);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Year</TableHead>
          <TableHead numeric>Payroll</TableHead>
          <TableHead numeric>Headcount</TableHead>
          {columns.map((column) => (
            <TableHead key={column.key} numeric>
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {points.map((point) => (
          <TableRow key={point.date}>
            <TableCell>{pointLabel(point)}</TableCell>
            <TableCell numeric>
              {formatMoney(point.totalBaseMinor, currencyCode, { fraction: false })}
            </TableCell>
            <TableCell numeric>{point.headcount.toLocaleString('en-US')}</TableCell>
            {group !== 'total' &&
              groupsOf(point, group).map((entry) => (
                <TableCell key={entry.key} numeric>
                  {formatMoney(entry.totalBaseMinor, currencyCode, { fraction: false })}
                </TableCell>
              ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TrendChart({
  points,
  group,
  currencyCode,
}: {
  points: TrendPoint[];
  group: Group;
  currencyCode: string;
}) {
  // Every point lists every group in reference order, so a group keeps its colour across ranges.
  const series = group === 'total' || !points[0] ? [] : groupsOf(points[0], group);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-56 w-full"
        role="img"
        aria-label="Bar chart of annual payroll at each year end and today"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey={pointLabel}
              tick={AXIS_TICK}
              axisLine={AXIS_LINE}
              tickLine={AXIS_LINE}
            />
            <YAxis
              width={VALUE_AXIS_WIDTH}
              tickFormatter={(value: number) => formatMoneyCompact(wholeTick(value), currencyCode)}
              tick={AXIS_TICK}
              axisLine={AXIS_LINE}
              tickLine={AXIS_LINE}
            />
            <Tooltip
              content={<TrendTooltip group={group} currencyCode={currencyCode} />}
              cursor={{ fill: 'var(--surface)' }}
            />
            {group === 'total' ? (
              <Bar dataKey="totalBaseMinor" fill="var(--accent)" isAnimationActive={false} />
            ) : (
              series.map((entry, index) => (
                <Bar
                  key={entry.key}
                  stackId="payroll"
                  dataKey={(point: TrendPoint) =>
                    groupsOf(point, group).find((candidate) => candidate.key === entry.key)
                      ?.totalBaseMinor ?? 0
                  }
                  name={entry.label}
                  fill={seriesColor(index)}
                  stroke="var(--background)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {series.length > 0 && (
        <ChartLegend
          items={series.map((entry, index) => ({ label: entry.label, color: seriesColor(index) }))}
        />
      )}
      <p className="text-[11px] font-semibold tracking-wide text-text-secondary uppercase">
        Headcount
      </p>
      <div
        className="h-16 w-full"
        role="img"
        aria-label="Line chart of headcount at the same points"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: VALUE_AXIS_WIDTH }}>
            <XAxis dataKey={pointLabel} scale="band" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip content={<HeadcountTooltip />} />
            <Line
              dataKey="headcount"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 2, fill: 'var(--accent)' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PayrollTrendCard() {
  const [range, setRange] = useState<YearRange>('5y');
  const [group, setGroup] = useState<Group>('total');
  const { data, error, isPending, refetch } = usePayrollTrend();
  const points = data ? trendPointsInRange(data.points, range) : [];
  const currencyCode = data?.baseCurrency ?? 'USD';

  return (
    <ChartCard
      question="How is payroll changing?"
      answer={data ? payrollTrendAnswer(data.summary, data.baseCurrency) : undefined}
      controls={
        <>
          <SegmentedControl
            label="Range"
            value={range}
            options={RANGE_OPTIONS}
            onChange={setRange}
          />
          <SegmentedControl
            label="Group"
            value={group}
            options={GROUP_OPTIONS}
            onChange={setGroup}
          />
        </>
      }
      caption={CAPTION}
      pending={isPending}
      error={
        error
          ? {
              message: error.message,
              onRetry: () => {
                void refetch();
              },
            }
          : undefined
      }
      table={
        data ? <TrendTable points={points} group={group} currencyCode={currencyCode} /> : undefined
      }
    >
      <TrendChart points={points} group={group} currencyCode={currencyCode} />
    </ChartCard>
  );
}
