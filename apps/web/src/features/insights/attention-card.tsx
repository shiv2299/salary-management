'use client';

import type { AttentionResponse } from '@acme/shared';
import Link from 'next/link';
import { ChartCard, RowsSkeleton } from '@/components/ui/chart-card';
import { attentionAnswer } from './answers';
import { useAttention } from './use-insights';

interface AttentionRow {
  title: string;
  count: number;
  meaning: string;
  detail?: string;
  href: string;
}

function rowsOf(attention: AttentionResponse): AttentionRow[] {
  const { groups } = attention.compression;
  return [
    {
      title: 'Outside peer range',
      // Two API counts of disjoint sets; their sum is the number of people outside the range.
      count: attention.outlierAbove + attention.outlierBelow,
      meaning: 'Paid well above or below others at the same level in the same country.',
      detail: `${attention.outlierAbove.toLocaleString('en-US')} above · ${attention.outlierBelow.toLocaleString('en-US')} below`,
      href: '/employees?attention=outlier-above&attention=outlier-below',
    },
    {
      title: 'No raise in over 2 years',
      count: attention.noRaise2y,
      meaning:
        'Active employees whose last raise or promotion took effect more than 24 months ago.',
      href: '/employees?attention=no-raise-2y',
    },
    {
      title: 'Paid less than new hires',
      count: attention.compression.peopleCount,
      meaning:
        groups.length === 0
          ? 'No country and level where new hires are paid more.'
          : `Long-tenured staff in groups where people hired in the last year are paid more: ${groups
              .map((group) => `${group.countryName} ${group.levelCode}`)
              .join(', ')}.`,
      href: '/employees?attention=compression',
    },
  ];
}

function AttentionRows({ attention }: { attention: AttentionResponse }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rowsOf(attention).map((row) => (
        <li key={row.title} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
          <span className="min-w-16 shrink-0 text-[22px] leading-7 font-[650] text-text-primary tabular-nums">
            {row.count.toLocaleString('en-US')}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <p className="font-semibold text-text-primary">{row.title}</p>
            <p className="text-text-secondary">{row.meaning}</p>
            {row.detail && <p className="text-text-secondary tabular-nums">{row.detail}</p>}
            {row.count > 0 && (
              <Link
                href={row.href}
                className="mt-1 self-start font-medium text-primary hover:underline"
              >
                View these people →
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AttentionCard() {
  const { data, error, refetch } = useAttention();

  return (
    <ChartCard
      question="Who needs attention?"
      answer={data ? attentionAnswer(data) : undefined}
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
    >
      {data ? (
        <AttentionRows attention={data} />
      ) : (
        <RowsSkeleton rows={3} label="Loading the people who need attention" />
      )}
    </ChartCard>
  );
}
