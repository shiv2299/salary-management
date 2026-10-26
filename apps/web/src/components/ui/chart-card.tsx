'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { Button } from './button';
import { Skeleton } from './skeleton';

/** Axis-shaped placeholder: a y-axis rail, bars of varying length, and an x-axis rule. */
export function ChartSkeleton({ label }: { label: string }) {
  const widths = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2'];
  return (
    <div role="status" className="flex h-64 gap-3">
      <Skeleton className="h-full w-px" />
      <div className="flex flex-1 flex-col justify-around">
        {widths.map((width) => (
          <Skeleton key={width} className={`h-6 ${width}`} />
        ))}
        <Skeleton className="h-px w-full" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function RowsSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <div role="status" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** The key for a chart with several series: a swatch and a name for each. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul
      aria-label="Chart key"
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary"
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * One Insights question: the question as a label, the answer as a sentence, then the evidence (a
 * chart, or the same figures as a table), a caption, and where it applies a link to act on it.
 */
export function ChartCard({
  question,
  answer,
  controls,
  caption,
  table,
  action,
  error,
  pending = false,
  children,
  footer,
}: {
  question: string;
  answer?: ReactNode;
  controls?: ReactNode;
  caption?: string;
  table?: ReactNode;
  action?: { href: string; label: string };
  error?: { message: string; onRetry: () => void };
  pending?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const questionId = useId();
  const [showTable, setShowTable] = useState(false);
  const ready = !error && !pending;
  const tableShown = showTable && table !== undefined;

  return (
    <section
      aria-labelledby={questionId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background p-4"
    >
      <header className="flex min-h-7 items-start justify-between gap-2">
        <h2
          id={questionId}
          className="pt-1 text-[11px] font-semibold tracking-wide text-text-secondary uppercase"
        >
          {question}
        </h2>
        {ready && table !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={tableShown}
            className="text-primary"
            onClick={() => {
              setShowTable(!tableShown);
            }}
          >
            {tableShown ? 'View as chart' : 'View as table'}
          </Button>
        )}
      </header>
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm">
          <p className="text-negative">{error.message}</p>
          <Button variant="outline" size="sm" onClick={error.onRetry}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          {answer === undefined ? (
            <div role="status">
              <Skeleton className="h-5 w-3/4" />
              <span className="sr-only">Loading the answer</span>
            </div>
          ) : (
            <p className="text-[15px] leading-snug font-semibold text-text-primary">{answer}</p>
          )}
          {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
          {pending ? (
            <ChartSkeleton label="Loading the chart" />
          ) : tableShown ? (
            <div className="overflow-x-auto">{table}</div>
          ) : (
            children
          )}
          {caption && <p className="text-xs text-text-secondary">{caption}</p>}
          {action && ready && (
            <Link
              href={action.href}
              className="self-start text-sm font-medium text-primary hover:underline"
            >
              {action.label}
            </Link>
          )}
        </>
      )}
      {footer}
    </section>
  );
}
