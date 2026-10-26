'use client';

import type { PayrollChangeResponse } from '@acme/shared';
import {
  Bar,
  BarChart,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/ui/chart-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/features/reference/use-reference';
import { formatMoneyCompact, formatSignedMoney } from '@/lib/money';
import { CAUSE_LABELS, payrollChangeAnswer } from './answers';
import { AXIS_LINE, AXIS_TICK, TooltipBox, wholeTick } from './chart-style';
import { usePayrollChange } from './use-insights';

type Cause = PayrollChangeResponse['causes'][number];

function causeLabel(cause: Cause): string {
  return CAUSE_LABELS[cause.cause];
}

function CauseTooltip({
  active,
  payload,
  currencyCode,
}: {
  active?: boolean;
  payload?: { payload: Cause }[];
  currencyCode: string;
}) {
  const cause = payload?.[0]?.payload;
  if (!active || !cause) return null;
  return (
    <TooltipBox title={causeLabel(cause)}>
      <p className="tabular-nums">
        {formatSignedMoney(cause.amountBaseMinor, currencyCode, { fraction: false })}
      </p>
      <p className="text-text-secondary tabular-nums">
        {cause.count.toLocaleString('en-US')} people or changes
      </p>
    </TooltipBox>
  );
}

/** The signed amount at the outer end of a bar: right of an addition, left of a reduction. */
function AmountLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  currencyCode,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
  currencyCode: string;
}) {
  if (typeof value !== 'number') return null;
  const start = Number(x);
  const end = start + Number(width);
  const outer = value >= 0 ? Math.max(start, end) + 4 : Math.min(start, end) - 4;
  return (
    <text
      x={outer}
      y={Number(y) + Number(height) / 2}
      dominantBaseline="central"
      textAnchor={value >= 0 ? 'start' : 'end'}
      fontSize={11}
      fill="var(--text-primary)"
    >
      {formatSignedMoney(value, currencyCode, { compact: true })}
    </text>
  );
}

function ChangeChart({ change }: { change: PayrollChangeResponse }) {
  const currencyCode = change.baseCurrency;
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label="Bar chart of the change in annual payroll by cause"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={change.causes}
          layout="vertical"
          margin={{ top: 8, right: 56, bottom: 0, left: 56 }}
        >
          <XAxis
            type="number"
            tickFormatter={(value: number) => formatMoneyCompact(wholeTick(value), currencyCode)}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={AXIS_LINE}
          />
          <YAxis
            type="category"
            dataKey={causeLabel}
            width={104}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
          />
          <ReferenceLine x={0} stroke="var(--text-secondary)" />
          <Tooltip
            content={<CauseTooltip currencyCode={currencyCode} />}
            cursor={{ fill: 'var(--surface)' }}
          />
          <Bar dataKey="amountBaseMinor" fill="var(--accent)" isAnimationActive={false}>
            <LabelList
              dataKey="amountBaseMinor"
              content={(props) => <AmountLabel {...props} currencyCode={currencyCode} />}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChangeTable({ change }: { change: PayrollChangeResponse }) {
  const money = (amount: number) =>
    formatSignedMoney(amount, change.baseCurrency, { fraction: false });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cause</TableHead>
          <TableHead numeric>Change</TableHead>
          <TableHead numeric>People or changes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {change.causes.map((cause) => (
          <TableRow key={cause.cause}>
            <TableCell>{causeLabel(cause)}</TableCell>
            <TableCell numeric>{money(cause.amountBaseMinor)}</TableCell>
            <TableCell numeric>{cause.count.toLocaleString('en-US')}</TableCell>
          </TableRow>
        ))}
        <TableRow className="font-medium">
          <TableCell>Total change</TableCell>
          <TableCell numeric>{money(change.changeBaseMinor)}</TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function PayrollChangeCard() {
  const { data, error, isPending, refetch } = usePayrollChange();

  return (
    <ChartCard
      question="What added to payroll in the last 12 months?"
      answer={data ? payrollChangeAnswer(data) : undefined}
      caption={
        data
          ? `Change in annual payroll from ${formatDate(data.from)} to today, by cause. The bars add up to the total change.`
          : undefined
      }
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
      table={data ? <ChangeTable change={data} /> : undefined}
    >
      {data && <ChangeChart change={data} />}
    </ChartCard>
  );
}
