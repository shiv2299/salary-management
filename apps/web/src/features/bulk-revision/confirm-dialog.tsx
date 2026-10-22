'use client';

import type { BulkSummary } from '@acme/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatPercentageBp } from '@/lib/money';
import { formatDate } from '@/features/reference/use-reference';
import { addedPayrollText } from './figures-text';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  percentageBp: number;
  headcount: number;
  effectiveDate: string;
  note: string;
  revision: NonNullable<BulkSummary['revision']> | undefined;
  /** The preview and the summary both answer the current inputs, so what is shown is what applies. */
  figuresCurrent: boolean;
  pending: boolean;
  error: string | null;
  onApply: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-44 shrink-0 text-sm text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { revision, headcount } = props;
  const added = revision ? addedPayrollText(revision) : null;
  const overridden = revision?.overriddenCount ?? 0;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle className="text-base font-semibold text-text-primary">
          Confirm salary revision
        </DialogTitle>
        <dl className="flex flex-col gap-2">
          <Row label="Increase">
            {formatPercentageBp(props.percentageBp)}
            {overridden > 0 ? ` · ${overridden} edited by hand` : ''}
          </Row>
          <Row label="People">{headcount}</Row>
          <Row label="Effective">{formatDate(props.effectiveDate)}</Row>
          <Row label="Added to annual payroll">
            {added ? (
              <>
                {added.headline}
                {added.detail ? (
                  <span className="text-text-secondary"> · {added.detail}</span>
                ) : null}
              </>
            ) : (
              '…'
            )}
          </Row>
          {props.note.trim() !== '' ? <Row label="Note">{props.note}</Row> : null}
        </dl>
        {props.error ? (
          <p role="alert" className="text-sm text-negative">
            {props.error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="outline">Back to review</Button>
          </DialogClose>
          <Button disabled={props.pending || !props.figuresCurrent} onClick={props.onApply}>
            {`Apply ${headcount} ${headcount === 1 ? 'raise' : 'raises'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
