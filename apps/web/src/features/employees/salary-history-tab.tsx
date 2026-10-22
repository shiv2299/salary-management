'use client';

import type { EmployeeDetail } from '@acme/shared';
import { useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatChangeBp } from '@/lib/money';
import { REASON_LABELS } from '@/features/insights/recent-changes-panel';
import { formatDate, useFxAsOfLabel } from '@/features/reference/use-reference';
import {
  chartLabel,
  DEFAULT_HISTORY_RANGE,
  HISTORY_RANGES,
  historyChart,
  historySummaryText,
  timeSinceText,
  type HistoryRange,
} from './history-chart';
import { SalaryHistoryChart } from './salary-history-chart';
import { SalaryHistoryList } from './salary-history-list';

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase text-text-secondary">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function SalaryHistoryTab({ employee, today }: { employee: EmployeeDetail; today: string }) {
  const [range, setRange] = useState<HistoryRange>(DEFAULT_HISTORY_RANGE);
  const fxLabel = useFxAsOfLabel();
  const { historySummary: summary } = employee;
  const { headline, counts } = historySummaryText(employee);
  const jump = summary.biggestJump;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold">{headline}</p>
        {counts && <p className="text-xs text-text-secondary">{counts}</p>}
      </div>
      <SegmentedControl label="Range" value={range} options={HISTORY_RANGES} onChange={setRange} />
      <SalaryHistoryChart
        chart={historyChart(employee, range, today)}
        label={chartLabel(range, summary.convertedToUsd)}
      />
      {summary.convertedToUsd && fxLabel && (
        <p className="text-xs text-text-secondary">
          {`Shown in USD because this salary moved between currencies. ${fxLabel}.`}
        </p>
      )}
      <dl aria-label="History figures" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Figure
          label="Average yearly growth"
          value={
            summary.averageYearlyGrowthBp === null
              ? '—'
              : formatChangeBp(summary.averageYearlyGrowthBp)
          }
        />
        <Figure
          label="Biggest jump"
          value={
            jump
              ? `${formatChangeBp(jump.changeBp)} · ${REASON_LABELS[jump.reason]}, ${formatDate(jump.effectiveDate)}`
              : '—'
          }
        />
        <Figure label="Last change" value={timeSinceText(employee.salary.effectiveDate, today)} />
      </dl>
      <SalaryHistoryList employee={employee} />
    </div>
  );
}
