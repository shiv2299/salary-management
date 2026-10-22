'use client';

import type { SalaryHistoryEntry } from '@acme/shared';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { REASON_LABELS } from '@/features/insights/recent-changes-panel';
import { formatDate } from '@/features/reference/use-reference';
import {
  promotionLabel,
  REASON_COLORS,
  type HistoryChart,
  type HistoryChartPoint,
} from './history-chart';

const REASON_ORDER: SalaryHistoryEntry['reason'][] = [
  'hire',
  'raise',
  'promotion',
  'relocation',
  'correction',
];

/** January 1st of each year inside the range, thinned to at most about six labels. */
function yearTicks(startDate: string, endDate: string): number[] {
  const years: number[] = [];
  for (
    let year = Number(startDate.slice(0, 4)) + 1;
    year <= Number(endDate.slice(0, 4));
    year += 1
  ) {
    years.push(year);
  }
  const step = Math.max(1, Math.ceil(years.length / 6));
  return years
    .filter((_, index) => index % step === 0)
    .map((year) => Date.parse(`${String(year).padStart(4, '0')}-01-01T00:00:00Z`));
}

function HistoryDot(props: { cx?: number; cy?: number; payload?: HistoryChartPoint }) {
  const { cx, cy, payload } = props;
  const entry = payload?.entry;
  if (cx === undefined || cy === undefined || !entry) return <g />;
  const label = promotionLabel(entry);
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={REASON_COLORS[entry.reason]} />
      {label && (
        <text x={cx} y={cy - 9} textAnchor="middle" fontSize={11} fill="var(--series-promotion)">
          {label}
        </text>
      )}
    </g>
  );
}

function HistoryTooltip({
  active,
  payload,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: HistoryChartPoint }[];
  currencyCode: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-sm border border-border bg-background p-2 text-xs shadow-md">
      <p className="font-medium">{formatDate(point.date)}</p>
      <p className="tabular-nums">{formatMoney(point.amountMinor, currencyCode)}</p>
      {point.entry && <p className="text-text-secondary">{REASON_LABELS[point.entry.reason]}</p>}
    </div>
  );
}

export function SalaryHistoryChart({ chart, label }: { chart: HistoryChart; label: string }) {
  const start = Date.parse(`${chart.startDate}T00:00:00Z`);
  const end = Date.parse(`${chart.endDate}T00:00:00Z`);
  const reasons = REASON_ORDER.filter((reason) =>
    chart.points.some((point) => point.entry?.reason === reason),
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="h-[200px] w-full" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.points} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
            <XAxis
              type="number"
              dataKey="time"
              domain={[start, end]}
              ticks={yearTicks(chart.startDate, chart.endDate)}
              tickFormatter={(time: number) => String(new Date(time).getUTCFullYear())}
              tick={{ fontSize: 11 }}
              stroke="var(--border)"
            />
            <YAxis
              width={64}
              domain={['auto', 'auto']}
              tickFormatter={(value: number) => formatMoneyCompact(value, chart.currencyCode)}
              tick={{ fontSize: 11 }}
              stroke="var(--border)"
            />
            <Tooltip content={<HistoryTooltip currencyCode={chart.currencyCode} />} />
            <Line
              type="stepAfter"
              dataKey="amountMinor"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={<HistoryDot />}
              activeDot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul
        aria-label="Chart key"
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary"
      >
        {reasons.map((reason) => (
          <li key={reason} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: REASON_COLORS[reason] }}
            />
            {REASON_LABELS[reason]}
          </li>
        ))}
      </ul>
      {chart.changeCount === 0 && (
        <p className="text-sm text-text-secondary">No salary changes in this period.</p>
      )}
    </div>
  );
}
