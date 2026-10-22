import { Check } from 'lucide-react';
import { cn } from 'cn';

/** Numbered steps; those before `current` are done, and `current === steps.length` means all are. */
export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="Progress" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 text-sm',
              active ? 'font-medium text-text-primary' : 'text-text-secondary',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-full border text-xs',
                done && 'border-primary bg-primary text-primary-foreground',
                active && 'border-primary text-primary',
                !done && !active && 'border-border',
              )}
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            <span>{label}</span>
            {done ? <span className="sr-only"> (done)</span> : null}
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="ml-1 hidden h-px w-6 bg-border sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
