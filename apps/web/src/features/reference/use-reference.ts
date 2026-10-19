import {
  countrySchema,
  departmentSchema,
  fxConvertResponseSchema,
  fxRatesSchema,
  levelSchema,
} from '@acme/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet } from '@/lib/api';

// Reference data is static for the life of a deployment, so it is fetched once per session.
const STATIC = { staleTime: Infinity, gcTime: Infinity } as const;

export function useCountries() {
  return useQuery({
    queryKey: ['reference', 'countries'],
    queryFn: () => apiGet('/api/reference/countries', z.array(countrySchema)),
    ...STATIC,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ['reference', 'departments'],
    queryFn: () => apiGet('/api/reference/departments', z.array(departmentSchema)),
    ...STATIC,
  });
}

export function useLevels() {
  return useQuery({
    queryKey: ['reference', 'levels'],
    queryFn: () => apiGet('/api/reference/levels', z.array(levelSchema)),
    ...STATIC,
  });
}

export function useFxRates() {
  return useQuery({
    queryKey: ['reference', 'fx-rates'],
    queryFn: () => apiGet('/api/reference/fx-rates', fxRatesSchema),
    ...STATIC,
  });
}

/** The server converts; the browser only displays the result. */
export function fetchConvertedAmount(amountMinor: number, from: string, to: string) {
  const query = new URLSearchParams({ amountMinor: String(amountMinor), from, to });
  return apiGet(`/api/reference/fx/convert?${query.toString()}`, fxConvertResponseSchema);
}

/** "FX rates as of 12 Oct 2026", from the latest rate date; null until the rates have loaded. */
export function useFxAsOfLabel(): string | null {
  const { data } = useFxRates();
  if (!data || data.rates.length === 0) return null;
  const latest =
    data.rates
      .map((rate) => rate.asOfDate)
      .sort()
      .at(-1) ?? '';
  return `FX rates as of ${formatDate(latest)}`;
}

export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
