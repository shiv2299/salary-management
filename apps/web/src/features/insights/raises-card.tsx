'use client';

import type { IncreaseStats, RaiseStatsResponse } from '@acme/shared';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type MouseHandlerDataParam,
} from 'recharts';
import { Button } from '@/components/ui/button';
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
import { formatMoney, formatMoneyCompact, formatPercentageBp } from '@/lib/money';
import { raisesAnswer } from './answers';
import { RANGE_OPTIONS, yearsInRange, type YearRange } from './chart-data';
import { AXIS_LINE, AXIS_TICK, TooltipBox, seriesColor, wholeTick } from './chart-style';
import { useRaiseStats } from './use-insights';

type Show = 'average' | 'cost';
type Group = 'all' | 'country' | 'department';
type RaiseYear = RaiseStatsResponse['years'][number];

const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: 'average', label: 'Average %' },
  { value: 'cost', label: '$ cost' },
];

const GROUP_OPTIONS: { value: Group; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'country', label: 'Country' },
  { value: 'department', label: 'Department' },
];

const CAPTIONS: Record<Show, string> = {
  average: 'Average raise per calendar year; raises within one currency only.',
  cost: "Payroll added each calendar year by raises and promotions, in USD at today's FX rates.",
};

const MISSING = '—';

/** The y-axis width of the main chart; the raise count strip leaves the same margin so points line up. */
const VALUE_AXIS_WIDTH = 64;

const CHART_MARGIN = { top: 16, right: 16, bottom: 0, left: 0 };

/** Keeps the first and last point labels clear of the axes; the strip uses the same padding. */
const LINE_PADDING = { left: 24, right: 24 };

function yearLabel(entry: RaiseYear): string {
  return entry.yearToDate ? `${entry.year} (YTD)` : String(entry.year);
}

function groupsOf(entry: RaiseYear, group: Exclude<Group, 'all'>) {
  return group === 'country' ? entry.byCountry : entry.byDepartment;
}

function groupStats(entry: RaiseYear, group: Exclude<Group, 'all'>, key: string) {
  return groupsOf(entry, group).find((candidate) => candidate.key === key);
}

function average(stats: IncreaseStats | undefined): string {
  return stats?.averageRaiseBp == null ? MISSING : formatPercentageBp(stats.averageRaiseBp);
}

function RaisesTooltip({
  active,
  payload,
  show,
  group,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: RaiseYear }[];
  show: Show;
  group: Group;
  currencyCode: string;
}) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) return null;
  const money = (amount: number) => formatMoney(amount, currencyCode, { fraction: false });
  return (
    <TooltipBox title={yearLabel(entry)}>
      {group === 'all' ? (
        show === 'average' ? (
          <>
            <p className="tabular-nums">{average(entry.all)} average raise</p>
            <p className="text-text-secondary tabular-nums">
              {entry.all.raiseCount.toLocaleString('en-US')} raises
            </p>
          </>
        ) : (
          <>
            <p className="tabular-nums">Raises: {money(entry.all.raisesAddedBaseMinor)}</p>
            <p className="tabular-nums">Promotions: {money(entry.all.promotionsAddedBaseMinor)}</p>
          </>
        )
      ) : (
        groupsOf(entry, group).map((stats) => (
          <p key={stats.key} className="text-text-secondary tabular-nums">
            {stats.label}: {show === 'average' ? average(stats) : money(stats.totalAddedBaseMinor)}
          </p>
        ))
      )}
    </TooltipBox>
  );
}

function RaiseCountTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: RaiseYear }[];
}) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) return null;
  return (
    <TooltipBox title={yearLabel(entry)}>
      <p className="tabular-nums">{entry.all.raiseCount.toLocaleString('en-US')} raises</p>
    </TooltipBox>
  );
}

function RaisesChart({
  years,
  show,
  group,
  currencyCode,
  onSelectYear,
}: {
  years: RaiseYear[];
  show: Show;
  group: Group;
  currencyCode: string;
  onSelectYear: (year: number) => void;
}) {
  // Every year lists every group in reference order, so a group keeps its colour across ranges.
  const series = group === 'all' || !years[0] ? [] : groupsOf(years[0], group);
  const labels = new Map(years.map((entry) => [entry.year, yearLabel(entry)]));
  const xAxis = (
    <XAxis
      dataKey="year"
      padding={show === 'average' ? LINE_PADDING : undefined}
      tickFormatter={(year: number) => labels.get(year) ?? String(year)}
      tick={AXIS_TICK}
      axisLine={AXIS_LINE}
      tickLine={AXIS_LINE}
    />
  );
  const tooltip = (
    <Tooltip
      content={<RaisesTooltip show={show} group={group} currencyCode={currencyCode} />}
      cursor={show === 'cost' ? { fill: 'var(--surface)' } : { stroke: 'var(--border)' }}
    />
  );
  const selectYear = (state: MouseHandlerDataParam) => {
    if (state.activeLabel !== undefined) onSelectYear(Number(state.activeLabel));
  };
  const legend =
    group === 'all'
      ? show === 'cost'
        ? [
            { label: 'Raises', color: seriesColor(0) },
            { label: 'Promotions', color: seriesColor(1) },
          ]
        : []
      : series.map((entry, index) => ({ label: entry.label, color: seriesColor(index) }));

  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-56 w-full cursor-pointer"
        role="img"
        aria-label={
          show === 'average'
            ? 'Line chart of the average raise in each calendar year'
            : 'Bar chart of payroll added by raises and promotions in each calendar year'
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          {show === 'average' ? (
            // Raises are plotted in basis points; only the labels turn them into percentages.
            <LineChart data={years} margin={CHART_MARGIN} onClick={selectYear}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              {xAxis}
              <YAxis
                width={VALUE_AXIS_WIDTH}
                tickFormatter={(value: number) => formatPercentageBp(wholeTick(value))}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={AXIS_LINE}
              />
              {tooltip}
              {group === 'all' ? (
                <Line
                  dataKey={(entry: RaiseYear) => entry.all.averageRaiseBp}
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--accent)' }}
                  isAnimationActive={false}
                >
                  <LabelList
                    position="top"
                    fontSize={11}
                    fill="var(--text-primary)"
                    formatter={(value) =>
                      typeof value === 'number' ? formatPercentageBp(value) : ''
                    }
                  />
                </Line>
              ) : (
                series.map((entry, index) => (
                  <Line
                    key={entry.key}
                    dataKey={(year: RaiseYear) =>
                      groupStats(year, group, entry.key)?.averageRaiseBp ?? null
                    }
                    name={entry.label}
                    stroke={seriesColor(index)}
                    strokeWidth={2}
                    dot={{ r: 2, fill: seriesColor(index) }}
                    isAnimationActive={false}
                  />
                ))
              )}
            </LineChart>
          ) : (
            <BarChart data={years} margin={CHART_MARGIN} onClick={selectYear}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              {xAxis}
              <YAxis
                width={VALUE_AXIS_WIDTH}
                tickFormatter={(value: number) =>
                  formatMoneyCompact(wholeTick(value), currencyCode)
                }
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={AXIS_LINE}
              />
              {tooltip}
              {group === 'all'
                ? [
                    <Bar
                      key="raises"
                      stackId="added"
                      dataKey={(entry: RaiseYear) => entry.all.raisesAddedBaseMinor}
                      name="Raises"
                      fill={seriesColor(0)}
                      stroke="var(--background)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />,
                    <Bar
                      key="promotions"
                      stackId="added"
                      dataKey={(entry: RaiseYear) => entry.all.promotionsAddedBaseMinor}
                      name="Promotions"
                      fill={seriesColor(1)}
                      stroke="var(--background)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />,
                  ]
                : series.map((entry, index) => (
                    <Bar
                      key={entry.key}
                      stackId="added"
                      dataKey={(year: RaiseYear) =>
                        groupStats(year, group, entry.key)?.totalAddedBaseMinor ?? 0
                      }
                      name={entry.label}
                      fill={seriesColor(index)}
                      stroke="var(--background)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {legend.length > 0 && <ChartLegend items={legend} />}
      {show === 'average' && group === 'all' && (
        <>
          <p className="text-[11px] font-semibold tracking-wide text-text-secondary uppercase">
            Number of raises
          </p>
          <div
            className="h-16 w-full"
            role="img"
            aria-label="Line chart of the number of raises in each calendar year"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={years}
                margin={{ ...CHART_MARGIN, top: 4, bottom: 4, left: VALUE_AXIS_WIDTH }}
              >
                <XAxis dataKey="year" padding={LINE_PADDING} hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip content={<RaiseCountTooltip />} />
                <Line
                  dataKey={(entry: RaiseYear) => entry.all.raiseCount}
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 2, fill: 'var(--accent)' }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function RaisesTable({
  years,
  show,
  group,
  currencyCode,
  onSelectYear,
}: {
  years: RaiseYear[];
  show: Show;
  group: Group;
  currencyCode: string;
  onSelectYear: (year: number) => void;
}) {
  const money = (amount: number) => formatMoney(amount, currencyCode, { fraction: false });
  const columns = group === 'all' || !years[0] ? [] : groupsOf(years[0], group);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Year</TableHead>
          <TableHead numeric>Raises</TableHead>
          <TableHead numeric>Average raise</TableHead>
          <TableHead numeric>Added by raises</TableHead>
          <TableHead numeric>Added by promotions</TableHead>
          {columns.map((column) => (
            <TableHead key={column.key} numeric>
              {column.label}
            </TableHead>
          ))}
          <TableHead>
            <span className="sr-only">Recent changes</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {years.map((entry) => (
          <TableRow key={entry.year}>
            <TableCell>{yearLabel(entry)}</TableCell>
            <TableCell numeric>{entry.all.raiseCount.toLocaleString('en-US')}</TableCell>
            <TableCell numeric>{average(entry.all)}</TableCell>
            <TableCell numeric>{money(entry.all.raisesAddedBaseMinor)}</TableCell>
            <TableCell numeric>{money(entry.all.promotionsAddedBaseMinor)}</TableCell>
            {group !== 'all' &&
              groupsOf(entry, group).map((stats) => (
                <TableCell key={stats.key} numeric>
                  {show === 'average' ? average(stats) : money(stats.totalAddedBaseMinor)}
                </TableCell>
              ))}
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary"
                onClick={() => {
                  onSelectYear(entry.year);
                }}
              >
                {`Show changes in ${entry.year}`}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RaisesCard({ onSelectYear }: { onSelectYear: (year: number) => void }) {
  const [show, setShow] = useState<Show>('average');
  const [range, setRange] = useState<YearRange>('5y');
  const [group, setGroup] = useState<Group>('all');
  const { data, error, isPending, refetch } = useRaiseStats();
  const currencyCode = data?.baseCurrency ?? 'USD';
  const years = data ? yearsInRange(data.years, range, Number(data.asOf.slice(0, 4))) : [];
  const view = { years, show, group, currencyCode, onSelectYear };

  return (
    <ChartCard
      question="What are we giving in raises?"
      answer={data ? raisesAnswer(data.trailing, data.baseCurrency) : undefined}
      controls={
        <>
          <SegmentedControl label="Show" value={show} options={SHOW_OPTIONS} onChange={setShow} />
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
      caption={CAPTIONS[show]}
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
      table={data ? <RaisesTable {...view} /> : undefined}
    >
      <RaisesChart {...view} />
    </ChartCard>
  );
}
