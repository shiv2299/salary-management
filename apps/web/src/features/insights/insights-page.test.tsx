import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
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

function recentChanges(range: string) {
  return {
    range,
    year: null,
    windowStart: '2023-10-19',
    windowEnd: '2026-10-19',
    availableYears: [2026, 2025],
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

/** Year ends 2019–2025 and today; each year adds $10M, and today is $612.4M. */
function trendPoint(year: number, isToday: boolean, totalBaseMinor: number, headcount: number) {
  const germany = Math.round(totalBaseMinor / 4);
  const india = Math.round(totalBaseMinor / 4);
  const engineering = Math.round(totalBaseMinor / 2);
  return {
    date: isToday ? '2026-01-15' : `${year}-12-31`,
    year,
    isToday,
    headcount,
    totalBaseMinor,
    byCountry: [
      { key: 'DE', label: 'Germany', headcount: 1, totalBaseMinor: germany },
      { key: 'IN', label: 'India', headcount: 1, totalBaseMinor: india },
      {
        key: 'US',
        label: 'United States',
        headcount: headcount - 2,
        totalBaseMinor: totalBaseMinor - germany - india,
      },
    ],
    byDepartment: [
      { key: '1', label: 'Engineering', headcount: 1, totalBaseMinor: engineering },
      {
        key: '2',
        label: 'Sales',
        headcount: headcount - 1,
        totalBaseMinor: totalBaseMinor - engineering,
      },
    ],
  };
}

const payrollTrend = {
  baseCurrency: 'USD',
  asOf: '2026-01-15',
  points: [
    ...Array.from({ length: 7 }, (_, index) =>
      trendPoint(2019 + index, false, 54_240_000_000 + index * 1_000_000_000, 9000 + index * 50),
    ),
    trendPoint(2026, true, 61_240_000_000, 9577),
  ],
  summary: {
    totalBaseMinor: 61_240_000_000,
    yearAgoTotalBaseMinor: 57_664_000_000,
    changeBp: 620,
    headcount: 9577,
    yearAgoHeadcount: 9265,
  },
};

const payrollChange = {
  baseCurrency: 'USD',
  from: '2025-01-15',
  to: '2026-01-15',
  fromTotalBaseMinor: 58_830_000_000,
  toTotalBaseMinor: 61_240_000_000,
  changeBaseMinor: 2_410_000_000,
  causes: [
    { cause: 'hires', amountBaseMinor: 1_800_000_000, count: 900 },
    { cause: 'raises', amountBaseMinor: 1_520_000_000, count: 3100 },
    { cause: 'promotions', amountBaseMinor: 400_000_000, count: 412 },
    { cause: 'relocations', amountBaseMinor: 10_000_000, count: 5 },
    { cause: 'corrections', amountBaseMinor: -20_000_000, count: 12 },
    { cause: 'leavers', amountBaseMinor: -1_300_000_000, count: 588 },
  ],
  largestAddition: 'hires',
};

function stats(averageRaiseBp: number | null, promotionCount: number) {
  return {
    raiseCount: 3100,
    averageRaiseBp,
    raisesAddedBaseMinor: 1_520_000_000,
    promotionCount,
    promotionsAddedBaseMinor: 400_000_000,
    totalAddedBaseMinor: 1_920_000_000,
  };
}

const raiseStats = {
  baseCurrency: 'USD',
  asOf: '2026-01-15',
  years: [{ year: 2026, yearToDate: true, all: stats(440, 30), byCountry: [], byDepartment: [] }],
  trailing: {
    current: { ...stats(440, 412), after: '2025-01-15', through: '2026-01-15' },
    previous: { ...stats(460, 380), after: '2024-01-15', through: '2025-01-15' },
  },
};

const attention = {
  asOf: '2026-01-15',
  activeHeadcount: 9577,
  outlierAbove: 142,
  outlierBelow: 45,
  outsidePeerRangeShareBp: 195,
  noRaise2y: 381,
  compression: { peopleCount: 0, groups: [] },
};

function stubInsights(overrides: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    'GET /api/insights/payroll-trend': payrollTrend,
    'GET /api/insights/payroll-change': payrollChange,
    'GET /api/insights/raises': raiseStats,
    'GET /api/insights/attention': attention,
    'GET /api/insights/distribution': {
      baseCurrency: 'USD',
      groupBy: 'country',
      groups: [{ key: 'IN', label: 'India', distribution }],
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
      Response.json(recentChanges(url.searchParams.get('range') ?? '3y')),
    'GET /api/reference/fx-rates': {
      baseCurrency: 'USD',
      rates: [
        { currencyCode: 'INR', asOfDate: '2026-01-15', rateToBaseNano: 11_980_000 },
        { currencyCode: 'EUR', asOfDate: '2026-01-15', rateToBaseNano: 1_080_000_000 },
        { currencyCode: 'USD', asOfDate: '2026-01-15', rateToBaseNano: 1_000_000_000 },
      ],
    },
    ...overrides,
  });
}

function tile(name: string) {
  return screen.getByRole('group', { name });
}

describe('InsightsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the meta line with the FX date and the constant-currency note', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Insights' })).toBeDefined();
    expect(
      await screen.findByText(
        'Active employees · USD at FX rates of 15 Jan 2026 · Past years use the same rates',
      ),
    ).toBeDefined();
  });

  it('shows the five headline tiles with their values and hints', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    expect(await within(tile('Annual payroll')).findByText('$612.4M')).toBeDefined();
    expect(within(tile('Annual payroll')).getByText('↑ 6.2% vs 12 months ago')).toBeDefined();
    expect(within(tile('Active headcount')).getByText('9,577')).toBeDefined();
    expect(within(tile('Active headcount')).getByText('↑ 312 vs 12 months ago')).toBeDefined();

    const raise = tile('Average raise, last 12 months');
    expect(await within(raise).findByText('4.4%')).toBeDefined();
    expect(within(raise).getByText('↓ from 4.6% the 12 months before')).toBeDefined();
    const promotions = tile('Promotions, last 12 months');
    expect(within(promotions).getByText('412')).toBeDefined();
    expect(within(promotions).getByText('↑ from 380 the 12 months before')).toBeDefined();

    const outside = tile('Paid outside peer range');
    expect(await within(outside).findByText('187')).toBeDefined();
    expect(within(outside).getByText('1.95% of active employees')).toBeDefined();
  });

  it('answers how payroll is changing and shows the year table', async () => {
    const { calls } = stubInsights();
    renderWithQuery(<InsightsPage />);

    const card = screen.getByRole('region', { name: 'How is payroll changing?' });
    expect(
      await within(card).findByText(
        'Payroll is $612.4M a year, up 6.2% on 12 months ago, with 312 more people.',
      ),
    ).toBeDefined();
    expect(
      within(card).getByText(
        "Annual payroll at each year end and today, in USD at today's FX rates.",
      ),
    ).toBeDefined();
    expect(calls.some((call) => call.url.pathname === '/api/insights/payroll')).toBe(false);

    fireEvent.click(within(card).getByRole('button', { name: 'View as table' }));

    const table = within(card).getByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['Year', 'Payroll', 'Headcount']);
    const rows = within(table).getAllByRole('row').slice(1);
    // 5Y is the default: the last five year ends and today.
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual([
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
      'Today',
    ]);
    const today = within(table).getByRole('row', { name: /Today/ });
    expect(within(today).getByText('$612,400,000')).toBeDefined();
    expect(within(today).getByText('9,577')).toBeDefined();

    fireEvent.click(within(card).getByRole('radio', { name: 'Country' }));

    const grouped = within(card).getByRole('table');
    expect(
      within(grouped)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Year', 'Payroll', 'Headcount', 'Germany', 'India', 'United States']);
    const groupedToday = within(grouped).getByRole('row', { name: /Today/ });
    expect(within(groupedToday).getAllByText('$153,100,000')).toHaveLength(2);
    expect(within(groupedToday).getByText('$306,200,000')).toBeDefined();

    fireEvent.click(within(card).getByRole('radio', { name: '3Y' }));
    expect(within(card).getAllByRole('row')).toHaveLength(5);
  });

  it('answers what added to payroll with a row per cause in the table', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    const card = screen.getByRole('region', {
      name: 'What added to payroll in the last 12 months?',
    });
    expect(
      await within(card).findByText(
        'Payroll rose $24.1M in the last 12 months. New hires added the most: $18M.',
      ),
    ).toBeDefined();
    expect(
      within(card).getByText(
        'Change in annual payroll from 15 Jan 2025 to today, by cause. The bars add up to the total change.',
      ),
    ).toBeDefined();

    fireEvent.click(within(card).getByRole('button', { name: 'View as table' }));

    const table = within(card).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Cause', 'Change', 'People or changes']);
    const raises = within(table).getByRole('row', { name: /Raises/ });
    expect(within(raises).getByText('+$15,200,000')).toBeDefined();
    expect(within(raises).getByText('3,100')).toBeDefined();
    const leavers = within(table).getByRole('row', { name: /People who left/ });
    expect(within(leavers).getByText('-$13,000,000')).toBeDefined();
    for (const label of ['New hires', 'Promotions', 'Relocations', 'Corrections']) {
      expect(within(table).getByRole('row', { name: new RegExp(label) })).toBeDefined();
    }
  });

  it('shows a retry in a card whose request failed, leaving the others', async () => {
    let failures = 0;
    const { calls } = stubInsights({
      'GET /api/insights/payroll-change': () => {
        failures += 1;
        return apiError(500, 'INTERNAL', 'Could not work out the payroll change.');
      },
    });
    renderWithQuery(<InsightsPage />);

    const card = screen.getByRole('region', {
      name: 'What added to payroll in the last 12 months?',
    });
    const alert = await within(card).findByRole('alert');
    expect(alert.textContent).toContain('Could not work out the payroll change.');
    expect(
      await screen.findByText(
        'Payroll is $612.4M a year, up 6.2% on 12 months ago, with 312 more people.',
      ),
    ).toBeDefined();

    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }));
    await vi.waitFor(() => {
      expect(failures).toBe(2);
    });
    expect(calls.filter((call) => call.url.pathname.endsWith('payroll-change'))).toHaveLength(2);
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
    const requests = calls.filter((c) => c.url.pathname.endsWith('recent-changes'));
    expect(requests[0]?.url.search).toBe('?range=3y&limit=10&offset=0');
    expect(requests.some((c) => c.url.searchParams.get('range') === '5y')).toBe(true);
  });

  it('flags an outlier with a text label, not colour alone', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    const row = (await screen.findByText('Meera Iyer')).closest('tr');
    expect(within(row as HTMLElement).getByText('Above peers')).toBeDefined();
  });
});
