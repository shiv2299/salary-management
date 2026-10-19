import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery, stubApi } from '@/test/render';
import { InsightsPage } from './insights-page';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const distribution = {
  headcount: 40,
  min: 1_000_000,
  max: 9_000_000,
  mean: 4_000_000,
  median: 4_200_000,
  p25: 2_000_000,
  p75: 6_000_000,
  p90: 7_500_000,
};

function recentChanges(years: number) {
  return {
    years,
    windowStart: '2023-10-19',
    total: 2,
    limit: 10,
    offset: 0,
    items: [
      {
        kind: 'batch',
        batchId: 7,
        effectiveDate: '2026-04-01',
        headcount: 47,
        percentageBp: 700,
        note: 'Engineering L3 India',
      },
      {
        kind: 'individual',
        historyId: 11,
        effectiveDate: '2026-03-02',
        reason: 'promotion',
        employee: {
          id: 5,
          firstName: 'Asha',
          lastName: 'Rao',
          countryCode: 'IN',
          status: 'inactive',
        },
        from: { amountMinor: 100_000_000, currencyCode: 'INR' },
        to: { amountMinor: 120_000_000, currencyCode: 'INR' },
      },
    ],
  };
}

function stubInsights() {
  return stubApi({
    'GET /api/insights/distribution': {
      baseCurrency: 'USD',
      groupBy: 'country',
      groups: [{ key: 'IN', label: 'India', distribution }],
    },
    'GET /api/insights/payroll': {
      baseCurrency: 'USD',
      groupBy: 'country',
      headcount: 40,
      totalBaseMinor: 160_000_000,
      groups: [{ key: 'IN', label: 'India', headcount: 40, totalBaseMinor: 160_000_000 }],
    },
    'GET /api/insights/outliers': {
      baseCurrency: 'USD',
      total: 1,
      items: [
        {
          employeeId: 9,
          firstName: 'Meera',
          lastName: 'Iyer',
          countryCode: 'IN',
          departmentName: 'Sales',
          levelCode: 'L2',
          jobTitle: 'Account Executive',
          salary: { amountMinor: 900_000_000, currencyCode: 'INR', amountBaseMinor: 10_800_000 },
          direction: 'above',
          peerGroup: {
            headcount: 30,
            p25: 1,
            median: 2,
            p75: 3,
            lowerFence: 100_000,
            upperFence: 5_000_000,
          },
        },
      ],
    },
    'GET /api/insights/recent-changes': (url) =>
      Response.json(recentChanges(Number(url.searchParams.get('years')))),
    'GET /api/reference/fx-rates': {
      baseCurrency: 'USD',
      rates: [
        { currencyCode: 'INR', asOfDate: '2026-01-15', rateToBaseNano: 11_980_000 },
        { currencyCode: 'EUR', asOfDate: '2026-01-15', rateToBaseNano: 1_080_000_000 },
        { currencyCode: 'USD', asOfDate: '2026-01-15', rateToBaseNano: 1_000_000_000 },
      ],
    },
  });
}

describe('InsightsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('labels the figures as USD with the date of the FX rates', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    expect(await screen.findByText(/FX rates as of 15 Jan 2026/)).toBeDefined();
  });

  it('shows a bulk revision as one entry with headcount and percentage', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    const entry = await screen.findByText(/47 people/);
    expect(entry.textContent).toContain('+7%');
    expect(entry.textContent).toContain('Engineering L3 India');
  });

  it('marks changes for employees who have since been deactivated', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    const row = (await screen.findByText('Asha Rao')).closest('li');
    expect(within(row as HTMLElement).getByText('Inactive')).toBeDefined();
  });

  it('asks for the five year window when that option is chosen', async () => {
    const { calls } = stubInsights();
    renderWithQuery(<InsightsPage />);
    await screen.findByText(/47 people/);

    fireEvent.click(screen.getByRole('radio', { name: '5 years' }));

    await screen.findByText(/47 people/);
    expect(calls.some((c) => c.url.searchParams.get('years') === '5')).toBe(true);
    expect(
      calls.find((c) => c.url.pathname.endsWith('recent-changes'))?.url.searchParams.get('years'),
    ).toBe('3');
  });

  it('flags an outlier with a text label, not colour alone', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    const row = (await screen.findByText('Meera Iyer')).closest('tr');
    expect(within(row as HTMLElement).getByText('Above peers')).toBeDefined();
  });
});
