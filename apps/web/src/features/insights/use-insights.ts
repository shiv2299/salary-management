import {
  distributionResponseSchema,
  outliersResponseSchema,
  payrollResponseSchema,
  recentChangesResponseSchema,
} from '@acme/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

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

export function useRecentChanges(range: '3y' | '5y', offset: number, limit: number) {
  return useQuery({
    queryKey: ['insights', 'recent-changes', range, offset, limit],
    queryFn: () =>
      apiGet(
        `/api/insights/recent-changes?range=${range}&limit=${limit}&offset=${offset}`,
        recentChangesResponseSchema,
      ),
    placeholderData: keepPreviousData,
  });
}
