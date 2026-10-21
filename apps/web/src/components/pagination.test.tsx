import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './pagination';

describe('Pagination', () => {
  it('offers 25, 50 and 100 rows per page and reports the choice', () => {
    const onPageSize = vi.fn();
    render(
      <Pagination
        page={1}
        pageSize={50}
        total={500}
        onPage={vi.fn()}
        pageSizeOptions={[25, 50, 100]}
        onPageSize={onPageSize}
      />,
    );

    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '100' } });

    expect(onPageSize).toHaveBeenCalledWith(100);
    expect(screen.getByText('1–50 of 500')).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous page' }).disabled).toBe(
      true,
    );
  });

  it('shows no rows-per-page control when no sizes are offered', () => {
    render(<Pagination page={1} pageSize={50} total={500} onPage={vi.fn()} />);

    expect(screen.queryByLabelText('Rows per page')).toBeNull();
  });
});
