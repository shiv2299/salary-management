import { ChevronDown, Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from 'cn';
import { exportHref, type ListFilters } from './list-filters';

/** A split button of plain download links: no fetch, no modal; the session cookie authenticates. */
export function ExportMenu({ filters }: { filters: ListFilters }) {
  return (
    <div className="inline-flex">
      <a
        href={exportHref('filtered', filters)}
        className={cn(buttonVariants({ variant: 'outline' }), 'rounded-r-none border-r-0')}
      >
        <Download />
        Export current result
      </a>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More export options"
          className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'w-8 rounded-l-none')}
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild>
            <a href={exportHref('all')}>Export all employees</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
