import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChartCard } from './chart-card';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const table = (
  <table>
    <tbody>
      <tr>
        <td>Today</td>
      </tr>
    </tbody>
  </table>
);

describe('ChartCard', () => {
  it('names the card by its question and shows the answer', () => {
    render(
      <ChartCard
        question="How is payroll changing?"
        answer="Payroll is $612.4M a year."
        caption="Annual payroll at each year end."
      >
        <p>chart</p>
      </ChartCard>,
    );

    const card = screen.getByRole('region', { name: 'How is payroll changing?' });
    expect(within(card).getByText('Payroll is $612.4M a year.')).toBeDefined();
    expect(within(card).getByText('Annual payroll at each year end.')).toBeDefined();
    expect(within(card).getByText('chart')).toBeDefined();
  });

  it('shows a placeholder for the answer and the chart while it loads', () => {
    render(<ChartCard question="How is payroll changing?" pending table={table} />);

    const card = screen.getByRole('region', { name: 'How is payroll changing?' });
    expect(within(card).getAllByRole('status').length).toBeGreaterThan(0);
    expect(within(card).queryByRole('button', { name: 'View as table' })).toBeNull();
  });

  it('toggles between the chart and the table', () => {
    render(
      <ChartCard question="How is payroll changing?" answer="Up." table={table}>
        <p>chart</p>
      </ChartCard>,
    );

    const toggle = screen.getByRole('button', { name: 'View as table' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(toggle);

    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.queryByText('chart')).toBeNull();
    const pressed = screen.getByRole('button', { name: 'View as chart' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(pressed);
    expect(screen.getByText('chart')).toBeDefined();
  });

  it('shows the error with a retry', () => {
    const onRetry = vi.fn();
    render(
      <ChartCard
        question="How is payroll changing?"
        error={{ message: 'Could not load the payroll trend.', onRetry }}
        table={table}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Could not load the payroll trend.');
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows the action link', () => {
    render(
      <ChartCard
        question="Who needs attention?"
        answer="187 people."
        action={{ href: '/employees?attention=compression', label: 'View these people →' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'View these people →' }).getAttribute('href')).toBe(
      '/employees?attention=compression',
    );
  });
});
