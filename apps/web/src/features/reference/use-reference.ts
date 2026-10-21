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

/** The country's name, falling back to its code until the reference data has loaded. */
export function useCountryName(code: string): string {
  return useCountries().data?.find((country) => country.code === code)?.name ?? code;
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

/** The latest rate date, formatted ("12 Oct 2026"); null until the rates have loaded. */
export function useFxAsOfDate(): string | null {
  const { data } = useFxRates();
  if (!data || data.rates.length === 0) return null;
  const latest =
    data.rates
      .map((rate) => rate.asOfDate)
      .sort()
      .at(-1) ?? '';
  return formatDate(latest);
}

/** "FX rates as of 12 Oct 2026", shown wherever converted amounts appear. */
export function useFxAsOfLabel(): string | null {
  const date = useFxAsOfDate();
  return date ? `FX rates as of ${date}` : null;
}

export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
