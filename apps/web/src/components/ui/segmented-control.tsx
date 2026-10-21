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
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'rounded-sm bg-surface p-0.5',
        size === 'md' ? 'flex w-full sm:inline-flex sm:w-auto' : 'inline-flex',
      )}
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
              'rounded-sm border font-medium',
              size === 'md'
                ? 'h-11 flex-1 px-1.5 text-sm sm:flex-none sm:px-3 md:h-9'
                : 'h-11 px-3 text-sm md:h-7 md:px-2.5 md:text-xs',
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
