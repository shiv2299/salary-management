import { healthResponseSchema } from '@acme/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet('/api/health', healthResponseSchema),
  });
}
