'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useSession } from './use-session';

/** Renders its children only once GET /api/auth/me confirms a session; a 401 goes to /login. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { error, isPending, refetch } = useSession();
  const unauthenticated = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  if (isPending || unauthenticated) {
    return (
      <div role="status" className="flex flex-col gap-3 px-4 py-6 md:px-8">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 px-4 py-6 md:px-8">
        <p className="text-negative">{error.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            void refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return children;
}
