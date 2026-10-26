'use client';

import { ChartCard, RowsSkeleton } from '@/components/ui/chart-card';
import { Chip } from '@/components/ui/chip';
import { recentChangesAnswer } from './answers';
import { ChangeEntry, changeEntryKey } from './change-entry';
import { useRecentChanges } from './use-insights';

const LATEST = 5;

/** The latest changes in the last three years, or in a year chosen in the raises card. */
export function RecentChangesCard({
  year,
  onClearYear,
}: {
  year: number | null;
  onClearYear: () => void;
}) {
  const { data, error, refetch, isPlaceholderData } = useRecentChanges({
    range: '3y',
    year,
    offset: 0,
    limit: LATEST,
  });

  return (
    <ChartCard
      question="What changed recently?"
      // The sentence describes the figures shown, so it follows the response, not the request.
      answer={data ? recentChangesAnswer(data.total, data) : undefined}
      controls={
        year !== null && (
          <Chip label={String(year)} removeLabel={`Remove year ${year}`} onRemove={onClearYear} />
        )
      }
      action={{
        href: year === null ? '/insights/changes' : `/insights/changes?year=${year}`,
        label: 'See all changes →',
      }}
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
        <ul className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          {data.items.map((entry) => (
            <ChangeEntry key={changeEntryKey(entry)} entry={entry} />
          ))}
        </ul>
      ) : (
        <RowsSkeleton rows={LATEST} label="Loading the latest changes" />
      )}
    </ChartCard>
  );
}
