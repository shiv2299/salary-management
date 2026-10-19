import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between text-xs text-text-secondary">
      <span className="tabular-nums">
        {first.toLocaleString('en-US')}–{last.toLocaleString('en-US')} of{' '}
        {total.toLocaleString('en-US')}
      </span>
      <span className="flex gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => {
            onPage(page - 1);
          }}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next page"
          disabled={page * pageSize >= total}
          onClick={() => {
            onPage(page + 1);
          }}
        >
          <ChevronRight />
        </Button>
      </span>
    </div>
  );
}
