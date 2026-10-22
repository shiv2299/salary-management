import {
  bulkConfirmResponseSchema,
  bulkPreviewResponseSchema,
  bulkSummaryResponseSchema,
  latestBulkRevisionSchema,
  type BulkConfirmBody,
  type BulkConfirmResponse,
  type BulkOverride,
  type BulkPreviewResponse,
  type BulkSummary,
  type LatestBulkRevision,
} from '@acme/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { apiGet, apiSend } from '@/lib/api';
import type { BulkTarget } from './selection';

const BASE = '/api/employees/bulk-salary-changes';

// The review never changes under the user except after a stale-preview conflict, which refetches
// the preview and the summary.
const FROZEN = { staleTime: Infinity, refetchOnWindowFocus: false } as const;

/** A preview with the percentage it was fetched with, which a confirm must send unchanged. */
export type BulkPreview = BulkPreviewResponse & { percentageBp: number };

export function useBulkPreview(
  target: BulkTarget | null,
  percentageBp: number | null,
): UseQueryResult<BulkPreview> {
  return useQuery({
    queryKey: ['bulk-revision', 'preview', JSON.stringify(target), percentageBp],
    queryFn: async () => ({
      ...(await apiSend('POST', `${BASE}/preview`, bulkPreviewResponseSchema, {
        ...target,
        percentageBp,
      })),
      // `enabled` holds the query back until a percentage is chosen.
      percentageBp: percentageBp!,
    }),
    enabled: target !== null && percentageBp !== null,
    placeholderData: keepPreviousData,
    ...FROZEN,
  });
}

export function useBulkSummary(
  target: BulkTarget | null,
  percentageBp: number | null,
  overrides: BulkOverride[],
): UseQueryResult<BulkSummary> {
  return useQuery({
    queryKey: ['bulk-revision', 'summary', JSON.stringify(target), percentageBp, overrides],
    queryFn: () =>
      apiSend('POST', `${BASE}/summary`, bulkSummaryResponseSchema, {
        ...target,
        ...(percentageBp !== null ? { percentageBp } : {}),
        ...(overrides.length > 0 ? { overrides } : {}),
      }),
    enabled: target !== null,
    placeholderData: keepPreviousData,
    ...FROZEN,
  });
}

export function useLatestBulkRevision(): UseQueryResult<LatestBulkRevision> {
  return useQuery({
    queryKey: ['bulk-revision', 'latest'],
    queryFn: () => apiGet(`${BASE}/latest`, latestBulkRevisionSchema),
  });
}

export function useConfirmBulkRevision(): UseMutationResult<
  BulkConfirmResponse,
  Error,
  BulkConfirmBody
> {
  return useMutation({
    mutationFn: (body: BulkConfirmBody) => apiSend('POST', BASE, bulkConfirmResponseSchema, body),
  });
}
