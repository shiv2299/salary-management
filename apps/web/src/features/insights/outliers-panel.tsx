'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import { Panel, PanelError, RowsSkeleton } from './panel';
import { useOutliers } from './use-insights';

const PAGE = 10;

export function OutliersPanel() {
  const { data, error, isPending, refetch } = useOutliers();
  const [shown, setShown] = useState(PAGE);

  return (
    <Panel
      title="Pay outliers"
      description={
        data
          ? `${data.total.toLocaleString('en-US')} active employees paid outside the range of their country and level peers (1.5 x IQR fences). Groups under 10 people are not evaluated.`
          : 'Active employees paid outside the range of their country and level peers.'
      }
    >
      {isPending ? (
        <RowsSkeleton rows={6} label="Loading outliers" />
      ) : error ? (
        <PanelError
          message={error.message}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : data.items.length === 0 ? (
        <p className="text-sm text-text-secondary">No outliers found.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs text-text-secondary">
                <tr>
                  <th className="h-8 px-2 text-left font-medium">Employee</th>
                  <th className="h-8 px-2 text-left font-medium">Country · Level</th>
                  <th className="h-8 px-2 text-right font-medium">Salary</th>
                  <th className="h-8 px-2 text-right font-medium">Salary (USD)</th>
                  <th className="h-8 px-2 text-right font-medium">Peer range (USD)</th>
                  <th className="h-8 px-2 text-left font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                {data.items.slice(0, shown).map((item) => (
                  <tr key={item.employeeId} className="border-b border-border">
                    <td className="h-8 px-2">
                      <Link
                        href={`/employees/${item.employeeId}`}
                        className="text-primary hover:underline"
                      >
                        {`${item.firstName} ${item.lastName}`}
                      </Link>
                      <div className="text-xs text-text-secondary">
                        {item.jobTitle} · {item.departmentName}
                      </div>
                    </td>
                    <td className="px-2 whitespace-nowrap">
                      {item.countryCode} · {item.levelCode}
                    </td>
                    <td className="px-2 text-right whitespace-nowrap tabular-nums">
                      {formatMoney(item.salary.amountMinor, item.salary.currencyCode, {
                        fraction: false,
                      })}
                    </td>
                    <td className="px-2 text-right whitespace-nowrap tabular-nums">
                      {formatMoney(item.salary.amountBaseMinor, data.baseCurrency, {
                        fraction: false,
                      })}
                    </td>
                    <td className="px-2 text-right whitespace-nowrap tabular-nums text-text-secondary">
                      {formatMoney(item.peerGroup.lowerFence, data.baseCurrency, {
                        fraction: false,
                      })}
                      {' to '}
                      {formatMoney(item.peerGroup.upperFence, data.baseCurrency, {
                        fraction: false,
                      })}
                    </td>
                    <td className="px-2">
                      <Badge variant="outline" className="border-warning text-warning">
                        <TriangleAlert />
                        {item.direction === 'above' ? 'Above peers' : 'Below peers'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown < data.items.length && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setShown((count) => count + PAGE * 4);
              }}
            >
              Show more ({data.items.length - shown} remaining)
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}
