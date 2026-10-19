'use client';

import { cn } from 'cn';

interface SegmentedControlProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A small radio-style toggle, used for "3 years / 5 years" and the grouping choices. */
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-sm border border-border bg-background p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onChange(option.value);
            }}
            className={cn(
              'h-10 rounded-sm px-3 text-sm font-medium md:h-6 md:px-2.5 md:text-xs',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'text-text-primary hover:bg-surface',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
