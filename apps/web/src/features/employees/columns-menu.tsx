import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HIDEABLE_COLUMNS, type ColumnVisibility, type HideableColumn } from './employee-table';

const LABELS: Record<HideableColumn, string> = {
  department: 'Department',
  level: 'Level',
  country: 'Country',
  hireDate: 'Hired',
  salary: 'Salary',
};

export function ColumnsMenu({
  visibility,
  onChange,
}: {
  visibility: ColumnVisibility;
  onChange: (next: ColumnVisibility) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Columns3 />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {HIDEABLE_COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column}
            checked={visibility[column]}
            onCheckedChange={(checked) => {
              onChange({ ...visibility, [column]: checked });
            }}
            // Keep the menu open so several columns can be toggled in one go.
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            {LABELS[column]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
