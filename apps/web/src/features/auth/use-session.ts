import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet } from '@/lib/api';

export const sessionSchema = z.object({ email: z.string() });

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => apiGet('/api/auth/me', sessionSchema),
    // A 401 is an answer, not a transient failure to retry.
    retry: false,
    staleTime: 5 * 60_000,
  });
}
