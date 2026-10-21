import { X } from 'lucide-react';

export function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-sm border border-accent-tint-border bg-accent-tint pr-1 pl-2 text-xs font-medium text-text-primary">
      {label}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove filter ${label}`}
          onClick={onRemove}
          className="relative inline-flex size-5 items-center justify-center rounded-sm before:absolute before:-inset-3 before:content-[''] md:before:hidden text-text-primary hover:bg-accent-tint-border/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
