'use client';

import type { LevelBandsResponse } from '@acme/shared';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type YAxisTickContentProps,
} from 'recharts';
import { ChartCard } from '@/components/ui/chart-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCountries } from '@/features/reference/use-reference';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { formatRatioBp, levelBandsAnswer } from './answers';
import { AXIS_LINE, AXIS_TICK, TooltipBox, wholeTick } from './chart-style';
import { FullBreakdown } from './full-breakdown';
import { useLevelBands } from './use-insights';

type Level = LevelBandsResponse['levels'][number];

const TOO_FEW = 'Too few people';
const MISSING = '—';
const LEVEL_AXIS_WIDTH = 40;

function caption(currencyCode: string): string {
  return `Each bar spans the middle half of people at that level, in ${currencyCode}; the tick marks typical pay (median).`;
}

/** The bottom-to-top-quarter bar, or nothing for a level too small to band. */
function middleHalf(level: Level): [number, number] | null {
  return level.typical ? [level.typical.p25, level.typical.p75] : null;
}

/** The middle-half bar with a tick at the median and the median written beside it. */
function BandShape({
  x,
  y,
  width,
  height,
  payload,
  currencyCode,
}: BarShapeProps & { currencyCode: string }) {
  const level = payload as Level | undefined;
  if (!level?.typical) return null;
  const { p25, median, p75 } = level.typical;
  // Plotting only: where the median falls between the two ends of the bar, in pixels.
  const tickX = p75 === p25 ? x : x + (width * (median - p25)) / (p75 - p25);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill="var(--series-secondary)" />
      <line
        x1={tickX}
        x2={tickX}
        y1={y - 3}
        y2={y + height + 3}
        stroke="var(--accent)"
        strokeWidth={3}
      />
      <text
        x={x + width + 6}
        y={y + height / 2}
        dominantBaseline="central"
        fontSize={11}
        fill="var(--text-primary)"
      >
        {formatMoney(median, currencyCode, { fraction: false })}
      </text>
    </g>
  );
}

/** The level code on the axis; a level too small to band says so in its row. */
function LevelTick({ x, y, index, payload, levels }: YAxisTickContentProps & { levels: Level[] }) {
  const level = levels[index];
  return (
    <g>
      <text x={Number(x)} y={Number(y)} dominantBaseline="central" textAnchor="end" {...AXIS_TICK}>
        {String(payload.value)}
      </text>
      {level && !level.typical && (
        <text
          x={Number(x) + 12}
          y={Number(y)}
          dominantBaseline="central"
          fontSize={11}
          fill="var(--text-secondary)"
        >
          {TOO_FEW}
        </text>
      )}
    </g>
  );
}

function BandTooltip({
  active,
  payload,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: Level }[];
  currencyCode: string;
}) {
  const level = payload?.[0]?.payload;
  if (!active || !level) return null;
  const money = (amount: number) => formatMoney(amount, currencyCode, { fraction: false });
  return (
    <TooltipBox title={level.levelCode}>
      <p className="text-text-secondary tabular-nums">
        {level.headcount.toLocaleString('en-US')} people
      </p>
      {level.typical ? (
        <>
          <p className="tabular-nums">Top quarter: {money(level.typical.p75)}</p>
          <p className="tabular-nums">Typical (median): {money(level.typical.median)}</p>
          <p className="tabular-nums">Bottom quarter: {money(level.typical.p25)}</p>
        </>
      ) : (
        <p>{TOO_FEW}</p>
      )}
    </TooltipBox>
  );
}

function BandsChart({ bands }: { bands: LevelBandsResponse }) {
  const { levels, currencyCode } = bands;
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label="Bar chart of the middle half of pay at each level, with the median marked"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={levels}
          layout="vertical"
          margin={{ top: 8, right: 88, bottom: 0, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            tickFormatter={(value: number) => formatMoneyCompact(wholeTick(value), currencyCode)}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={AXIS_LINE}
          />
          <YAxis
            type="category"
            dataKey="levelCode"
            width={LEVEL_AXIS_WIDTH}
            tick={(props: YAxisTickContentProps) => <LevelTick {...props} levels={levels} />}
            axisLine={AXIS_LINE}
            tickLine={false}
          />
          <Tooltip
            content={<BandTooltip currencyCode={currencyCode} />}
            cursor={{ fill: 'var(--surface)' }}
          />
          <Bar
            dataKey={middleHalf}
            barSize={14}
            isAnimationActive={false}
            shape={(props: BarShapeProps) => <BandShape {...props} currencyCode={currencyCode} />}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BandsTable({ bands }: { bands: LevelBandsResponse }) {
  const money = (amount: number) => formatMoney(amount, bands.currencyCode, { fraction: false });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Level</TableHead>
          <TableHead numeric>People</TableHead>
          <TableHead numeric>Bottom quarter</TableHead>
          <TableHead numeric>Typical (median)</TableHead>
          <TableHead numeric>Top quarter</TableHead>
          <TableHead numeric>Step from level below</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bands.levels.map((level) => (
          <TableRow key={level.levelId}>
            <TableCell>{level.levelCode}</TableCell>
            <TableCell numeric>{level.headcount.toLocaleString('en-US')}</TableCell>
            {level.typical ? (
              <>
                <TableCell numeric>{money(level.typical.p25)}</TableCell>
                <TableCell numeric>{money(level.typical.median)}</TableCell>
                <TableCell numeric>{money(level.typical.p75)}</TableCell>
              </>
            ) : (
              <TableCell colSpan={3} className="text-center text-text-secondary">
                {TOO_FEW}
              </TableCell>
            )}
            <TableCell numeric>
              {level.stepFromBelowBp === null ? MISSING : formatRatioBp(level.stepFromBelowBp)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function LevelBandsCard() {
  const countries = useCountries();
  const [chosen, setChosen] = useState('');
  const country = chosen || (countries.data?.[0]?.code ?? '');
  const countryName = countries.data?.find((entry) => entry.code === country)?.name ?? country;
  const bands = useLevelBands(country);
  const failed = countries.error ?? bands.error;

  return (
    <ChartCard
      question="Do levels mean consistent pay?"
      answer={bands.data ? levelBandsAnswer(bands.data, countryName) : undefined}
      controls={
        countries.data && (
          <SegmentedControl
            label="Country"
            value={country}
            options={countries.data.map((entry) => ({ value: entry.code, label: entry.name }))}
            onChange={setChosen}
          />
        )
      }
      caption={bands.data ? caption(bands.data.currencyCode) : undefined}
      pending={bands.isPending}
      error={
        failed
          ? {
              message: failed.message,
              onRetry: () => {
                void (countries.error ? countries.refetch() : bands.refetch());
              },
            }
          : undefined
      }
      table={bands.data ? <BandsTable bands={bands.data} /> : undefined}
      footer={<FullBreakdown />}
    >
      {bands.data && <BandsChart bands={bands.data} />}
    </ChartCard>
  );
}
