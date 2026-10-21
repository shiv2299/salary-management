'use client';

import { cn } from 'cn';

interface SegmentedControlProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

/** A radio-style toggle, used for "3 years / 5 years", the grouping choices and the salary change reason. */
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = 'sm',
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-sm bg-surface p-0.5">
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
              'rounded-sm border px-3 font-medium',
              size === 'md' ? 'h-11 text-sm md:h-9' : 'h-10 text-sm md:h-7 md:px-2.5 md:text-xs',
              selected
                ? 'border-border bg-background text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
