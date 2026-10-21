import type { FlagComponent } from 'country-flag-icons/react/3x2';
import DE from 'country-flag-icons/react/3x2/DE';
import IN from 'country-flag-icons/react/3x2/IN';
import US from 'country-flag-icons/react/3x2/US';

const flags: Record<string, FlagComponent> = { IN, US, DE };

// Decorative: the country name (or code) is always written beside it (docs/design.md §8).
export function CountryFlag({
  code,
  name,
  showName = true,
}: {
  code: string;
  name?: string;
  showName?: boolean;
}) {
  const Flag = flags[code];
  return (
    <span className="inline-flex items-center gap-2">
      {Flag ? (
        <Flag aria-hidden="true" className="h-3 w-[18px] shrink-0 rounded-[2px]" />
      ) : (
        <span
          data-fallback
          aria-hidden={showName ? 'true' : undefined}
          className="inline-flex h-4 shrink-0 items-center rounded-sm border border-border px-1 text-[10px] leading-none font-medium text-text-secondary"
        >
          {code}
        </span>
      )}
      {showName ? <span>{name ?? code}</span> : null}
    </span>
  );
}
