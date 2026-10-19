'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiSend } from '@/lib/api';
import { useSession } from './use-session';

export function UserMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useSession();

  const logout = useMutation({
    mutationFn: () => apiSend('POST', '/api/auth/logout', z.undefined()),
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="User menu" className="max-w-52">
          <span className="truncate">{data?.email ?? ''}</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onSelect={() => {
            logout.mutate();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
