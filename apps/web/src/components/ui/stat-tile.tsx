import { useId, type ReactNode } from 'react';
import { cn } from 'cn';

const tones = {
  neutral: 'text-text-primary',
  positive: 'text-positive',
  negative: 'text-negative',
  warning: 'text-warning',
} as const;

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning';
}) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="rounded-md border border-border bg-background p-4"
    >
      <div
        id={labelId}
        className="text-[11px] font-semibold tracking-wide text-text-secondary uppercase"
      >
        {label}
      </div>
      <div className={cn('mt-1 text-[22px] leading-7 font-[650] tabular-nums', tones[tone])}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-text-secondary">{hint}</div> : null}
    </div>
  );
}
