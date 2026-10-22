'use client';

import type { BulkPreviewItem } from '@acme/shared';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { formatInputAmount, parseMajorToMinor } from '@/lib/money';
import { resolveNewAmount } from './bulk-state';

/** An editable new-salary amount: the proposed figure until the user types their own. */
export function AmountCell({
  item,
  text,
  onChange,
}: {
  item: BulkPreviewItem;
  text: string | undefined;
  onChange: (text: string | undefined) => void;
}) {
  const errorId = useId();
  const name = `${item.firstName} ${item.lastName}`;
  const resolved = resolveNewAmount(item, text);
  const edited = text !== undefined && resolved.overridden;
  const error = !resolved.valid
    ? parseMajorToMinor(text ?? '', item.currencyCode) === null
      ? 'Enter an amount, for example 1234.50'
      : 'Must be higher than the current amount'
    : null;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <Input
          inputMode="decimal"
          autoComplete="off"
          aria-label={`New salary for ${name}`}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          data-overridden={resolved.overridden && resolved.valid ? 'true' : undefined}
          value={text ?? formatInputAmount(item.proposedAmountMinor, item.currencyCode)}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onBlur={() => {
            if (text === undefined) return;
            if (resolved.valid && !resolved.overridden) {
              onChange(undefined);
            } else if (resolved.valid) {
              onChange(formatInputAmount(resolved.amountMinor, item.currencyCode));
            }
          }}
          className="w-32 text-right tabular-nums data-[overridden=true]:border-warning data-[overridden=true]:bg-warning/10"
        />
        <span className="text-xs text-text-secondary">{item.currencyCode}</span>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-negative">
          {error}
        </p>
      ) : null}
      {edited ? (
        <span className="text-xs text-warning">
          edited ·{' '}
          <button
            type="button"
            aria-label={`Undo edit for ${name}`}
            onClick={() => {
              onChange(undefined);
            }}
            className="inline-flex min-h-11 items-center underline md:min-h-0"
          >
            undo
          </button>
        </span>
      ) : null}
    </div>
  );
}
