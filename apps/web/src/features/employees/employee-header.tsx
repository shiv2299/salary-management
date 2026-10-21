'use client';

import type { EmployeeDetail } from '@acme/shared';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CountryFlag } from '@/components/ui/country-flag';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LevelBadge } from '@/components/ui/level-badge';
import { useCountryName } from '@/features/reference/use-reference';
import { useSetEmployeeStatus } from './use-employee';

/** Deactivate (after a confirmation) or Reactivate, in the "More actions" menu. */
function EmployeeActions({ employee, name }: { employee: EmployeeDetail; name: string }) {
  const setStatus = useSetEmployeeStatus(employee.id);
  const [confirming, setConfirming] = useState(false);
  const inactive = employee.status === 'inactive';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {inactive ? (
            <DropdownMenuItem
              disabled={setStatus.isPending}
              onSelect={() => {
                setStatus.mutate('reactivate', {
                  onSuccess: () => toast.success(`${name} reactivated`),
                  onError: (error) => toast.error(error.message),
                });
              }}
            >
              Reactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-negative"
              onSelect={() => {
                setConfirming(true);
              }}
            >
              Deactivate…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle className="text-base font-semibold">Deactivate {name}?</DialogTitle>
          <DialogDescription className="text-sm text-text-secondary">
            They disappear from the default list and from insights. Their salary history is kept and
            you can reactivate them at any time.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={setStatus.isPending}
              onClick={() => {
                setStatus.mutate('deactivate', {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.success(`${name} deactivated`);
                  },
                  onError: (error) => {
                    setConfirming(false);
                    toast.error(error.message);
                  },
                });
              }}
            >
              Deactivate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EmployeeHeader({ employee }: { employee: EmployeeDetail }) {
  const name = `${employee.firstName} ${employee.lastName}`;
  const countryName = useCountryName(employee.countryCode);

  return (
    // Right padding keeps the actions menu clear of the drawer's close button.
    <header className="flex items-start gap-3 pr-9 md:pr-6">
      <Avatar name={name} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg leading-6 font-semibold">
          {name}
          {employee.status === 'inactive' && (
            <Badge variant="outline" className="border-inactive text-inactive">
              Inactive
            </Badge>
          )}
        </h2>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-text-secondary">
          {employee.jobTitle} · {employee.departmentName} · <LevelBadge code={employee.levelCode} />{' '}
          · <CountryFlag code={employee.countryCode} name={countryName} />
        </p>
      </div>
      <EmployeeActions employee={employee} name={name} />
    </header>
  );
}
