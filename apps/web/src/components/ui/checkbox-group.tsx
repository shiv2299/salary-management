import { useId, type ReactNode } from 'react';
import { cn } from 'cn';

export function CheckboxGroup<T extends string | number>({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string;
  options: { value: T; label: ReactNode; count?: number }[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
}) {
  const id = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[11px] font-semibold tracking-wide text-text-secondary uppercase">
        {legend}
      </legend>
      <div className="flex flex-col">
        {options.map((option, index) => {
          const checked = selected.includes(option.value);
          const labelId = `${id}-label-${index}`;
          const countId = `${id}-count-${index}`;
          const hasCount = option.count !== undefined;
          return (
            <label
              key={option.value}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-1 text-sm md:min-h-8',
                checked ? 'bg-accent-tint' : 'hover:bg-border',
                option.count === 0 && !checked ? 'text-text-secondary' : 'text-text-primary',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                aria-labelledby={labelId}
                aria-describedby={hasCount ? countId : undefined}
                onChange={() =>
                  onChange(
                    checked
                      ? selected.filter((value) => value !== option.value)
                      : [...selected, option.value],
                  )
                }
                className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
              <span id={labelId} className="flex-1">
                {option.label}
              </span>
              {hasCount ? (
                <span id={countId} className="text-xs tabular-nums text-text-secondary">
                  {option.count?.toLocaleString('en-US')}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
