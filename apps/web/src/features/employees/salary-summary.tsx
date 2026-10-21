'use client';

import type { EmployeeDetail } from '@acme/shared';
import { TriangleAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { formatMoney } from '@/lib/money';
import { formatDate, useCountryName } from '@/features/reference/use-reference';
import { outlierSentence, peerGroupLabel, tooFewPeersSentence } from './peer-copy';
import { usePeerContext } from './use-employee';

function PeerTile({ employee }: { employee: EmployeeDetail }) {
  const { data: peer, isPending } = usePeerContext(employee.id);
  const countryName = useCountryName(employee.countryCode);

  if (isPending) return <Skeleton role="status" aria-label="Loading peers" className="h-24" />;
  // Peer context is supplementary: when it cannot load, the salary itself still shows.
  if (!peer) return null;

  const label = `Typical for ${peerGroupLabel(peer, countryName)}`;
  if (!peer.typical) {
    return <StatTile label={label} value="—" hint={tooFewPeersSentence(peer, countryName)} />;
  }
  const money = (amountMinor: number) =>
    formatMoney(amountMinor, peer.currencyCode, { fraction: false });
  return (
    <StatTile
      label={label}
      value={`${money(peer.typical.p25)} – ${money(peer.typical.p75)}`}
      hint={`median ${money(peer.typical.median)} · ${peer.headcount.toLocaleString('en-US')} people`}
    />
  );
}

export function SalarySummary({ employee }: { employee: EmployeeDetail }) {
  const { salary } = employee;
  const { data: peer } = usePeerContext(employee.id);
  const countryName = useCountryName(employee.countryCode);
  const since = `since ${formatDate(salary.effectiveDate)}`;
  const outlier = peer ? outlierSentence(peer, countryName) : null;

  return (
    <section aria-label="Salary summary" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile
          label="Current salary"
          value={formatMoney(salary.amountMinor, salary.currencyCode)}
          hint={
            salary.currencyCode === 'USD'
              ? since
              : `${formatMoney(salary.amountBaseMinor, 'USD')} · ${since}`
          }
        />
        <PeerTile employee={employee} />
      </div>
      {outlier && (
        <p className="flex items-center gap-2 text-sm font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {outlier}
        </p>
      )}
    </section>
  );
}
