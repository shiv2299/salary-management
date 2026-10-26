import type { ReactNode } from 'react';

// Shared Recharts styling for the Insights cards, matching the salary history chart.

export const AXIS_LINE = { stroke: 'var(--border)' };
export const AXIS_TICK = { fontSize: 11, fill: 'var(--text-secondary)' };

const SERIES_COUNT = 7;

/** The categorical colour for the series at this position in reference order (docs/design.md §2). */
export function seriesColor(index: number): string {
  return `var(--series-${(index % SERIES_COUNT) + 1})`;
}

/** Recharts plots minor units; axis ticks are whole numbers before they are formatted as money. */
export function wholeTick(value: number): number {
  return Math.round(value);
}

export function TooltipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-background p-2 text-xs shadow-md">
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}
