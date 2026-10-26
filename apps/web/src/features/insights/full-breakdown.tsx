'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RowsSkeleton } from '@/components/ui/chart-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/money';
import { useDistribution, type DistributionGroupBy } from './use-insights';

const GROUP_OPTIONS: { value: DistributionGroupBy; label: string }[] = [
  { value: 'country', label: 'Country' },
  { value: 'department', label: 'Department' },
  { value: 'level', label: 'Level' },
];

/** The pay distribution of every group, in USD; it is only requested once opened. */
function BreakdownTable({ groupBy }: { groupBy: DistributionGroupBy }) {
  const { data, error, isPending, refetch } = useDistribution(groupBy);
  if (isPending) return <RowsSkeleton rows={4} label="Loading the breakdown" />;
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm">
        <p className="text-negative">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  const money = (amount: number) => formatMoney(amount, data.baseCurrency, { fraction: false });
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead numeric>People</TableHead>
            <TableHead numeric>Lowest</TableHead>
            <TableHead numeric>Bottom quarter earn under</TableHead>
            <TableHead numeric>
              Typical pay <em>(median)</em>
            </TableHead>
            <TableHead numeric>Average</TableHead>
            <TableHead numeric>Top quarter earn over</TableHead>
            <TableHead numeric>Top 10% earn over</TableHead>
            <TableHead numeric>Highest</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.groups.map(({ key, label, distribution: d }) => (
            <TableRow key={key}>
              <TableCell>{label}</TableCell>
              <TableCell numeric>{d.headcount.toLocaleString('en-US')}</TableCell>
              <TableCell numeric>{money(d.min)}</TableCell>
              <TableCell numeric>{money(d.p25)}</TableCell>
              <TableCell numeric>{money(d.median)}</TableCell>
              <TableCell numeric>{money(d.mean)}</TableCell>
              <TableCell numeric>{money(d.p75)}</TableCell>
              <TableCell numeric>{money(d.p90)}</TableCell>
              <TableCell numeric>{money(d.max)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function FullBreakdown() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<DistributionGroupBy>('country');

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-primary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!open);
        }}
      >
        Full breakdown
      </Button>
      {open && (
        <div id={panelId} className="flex flex-col gap-3">
          <SegmentedControl
            label="Group"
            value={groupBy}
            options={GROUP_OPTIONS}
            onChange={setGroupBy}
          />
          <BreakdownTable groupBy={groupBy} />
        </div>
      )}
    </div>
  );
}
