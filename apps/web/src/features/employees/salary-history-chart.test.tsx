import { render } from '@testing-library/react';
import { cloneElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { employeeDetail } from '@/test/fixtures';
import { historyChart } from './history-chart';
import { SalaryHistoryChart } from './salary-history-chart';

vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  // jsdom has no layout, so give the chart a fixed size.
  ResponsiveContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children, { width: 600, height: 200 } as object),
}));

describe('SalaryHistoryChart', () => {
  it('draws the axis labels in the secondary text colour and the axis lines in the border colour', () => {
    const { container } = render(
      <SalaryHistoryChart chart={historyChart(employeeDetail(), 'all', '2026-10-19')} label="x" />,
    );
    const labels = container.querySelectorAll('.recharts-cartesian-axis-tick-value');
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label.getAttribute('fill')).toBe('var(--text-secondary)');
    const lines = container.querySelectorAll('.recharts-cartesian-axis-line');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.getAttribute('stroke')).toBe('var(--border)');
  });
});
