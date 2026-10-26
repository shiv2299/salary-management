import {
  attentionResponseSchema,
  distributionResponseSchema,
  levelBandsResponseSchema,
  outliersResponseSchema,
  payrollChangeResponseSchema,
  payrollResponseSchema,
  payrollTrendResponseSchema,
  raiseStatsResponseSchema,
  recentChangesResponseSchema,
} from '@acme/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type { YearRange } from './chart-data';

export type DistributionGroupBy = 'country' | 'department' | 'level';
export type PayrollGroupBy = 'country' | 'department';

export function useDistribution(groupBy: DistributionGroupBy) {
  return useQuery({
    queryKey: ['insights', 'distribution', groupBy],
    queryFn: () =>
      apiGet(`/api/insights/distribution?groupBy=${groupBy}`, distributionResponseSchema),
  });
}

export function usePayroll(groupBy: PayrollGroupBy) {
  return useQuery({
    queryKey: ['insights', 'payroll', groupBy],
    queryFn: () => apiGet(`/api/insights/payroll?groupBy=${groupBy}`, payrollResponseSchema),
  });
}

export function useOutliers() {
  return useQuery({
    queryKey: ['insights', 'outliers'],
    queryFn: () => apiGet('/api/insights/outliers', outliersResponseSchema),
  });
}

export function usePayrollTrend() {
  return useQuery({
    queryKey: ['insights', 'payroll-trend'],
    queryFn: () => apiGet('/api/insights/payroll-trend', payrollTrendResponseSchema),
  });
}

export function usePayrollChange() {
  return useQuery({
    queryKey: ['insights', 'payroll-change'],
    queryFn: () => apiGet('/api/insights/payroll-change', payrollChangeResponseSchema),
  });
}

export function useRaiseStats() {
  return useQuery({
    queryKey: ['insights', 'raises'],
    queryFn: () => apiGet('/api/insights/raises', raiseStatsResponseSchema),
  });
}

export function useAttention() {
  return useQuery({
    queryKey: ['insights', 'attention'],
    queryFn: () => apiGet('/api/insights/attention', attentionResponseSchema),
  });
}

/** Waits until a country is chosen. */
export function useLevelBands(country: string) {
  return useQuery({
    queryKey: ['insights', 'level-bands', country],
    queryFn: () =>
      apiGet(
        `/api/insights/level-bands?country=${encodeURIComponent(country)}`,
        levelBandsResponseSchema,
      ),
    enabled: country !== '',
  });
}

export type RecentChangeReason = 'hire' | 'raise' | 'promotion' | 'relocation' | 'correction';

export interface RecentChangesParams {
  range: YearRange;
  /** A calendar year; the server lets it override the range. */
  year?: number | null;
  reason?: RecentChangeReason | null;
  offset: number;
  limit: number;
}

export function useRecentChanges({ range, year, reason, offset, limit }: RecentChangesParams) {
  const query = new URLSearchParams({ range });
  if (year != null) query.set('year', String(year));
  if (reason != null) query.set('reason', reason);
  query.set('limit', String(limit));
  query.set('offset', String(offset));
  return useQuery({
    queryKey: ['insights', 'recent-changes', range, year ?? null, reason ?? null, offset, limit],
    queryFn: () =>
      apiGet(`/api/insights/recent-changes?${query.toString()}`, recentChangesResponseSchema),
    placeholderData: keepPreviousData,
  });
}
