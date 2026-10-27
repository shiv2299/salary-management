import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFERENCE_ROUTES } from '@/test/fixtures';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { InsightsPage } from './insights-page';
import { RaisesCard } from './raises-card';

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

function recentChanges(url: URL) {
  const year = url.searchParams.get('year');
  return {
    range: url.searchParams.get('range') ?? '3y',
    year: year === null ? null : Number(year),
    windowStart: '2023-01-15',
    windowEnd: '2026-01-15',
    availableYears: [2026, 2025, 2024],
    total: 2,
    limit: 5,
    offset: 0,
    items: [
      {
        kind: 'batch',
        batchId: 7,
        effectiveDate: '2026-01-01',
        headcount: 1233,
        percentageBp: 357,
        note: 'Annual increment 2026',
      },
      {
        kind: 'individual',
        historyId: 11,
        effectiveDate: '2025-03-02',
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

function raiseYear(year: number) {
  const group = (key: string, label: string) => ({ ...stats(400, 10), key, label });
  return {
    year,
    yearToDate: year === 2026,
    all: stats(400 + (year - 2020) * 10, 300),
    byCountry: [group('IN', 'India'), group('US', 'United States')],
    byDepartment: [group('1', 'Engineering'), group('2', 'Sales')],
  };
}

const raiseStats = {
  baseCurrency: 'USD',
  asOf: '2026-01-15',
  years: Array.from({ length: 7 }, (_, index) => raiseYear(2020 + index)),
  trailing: {
    current: { ...stats(440, 412), after: '2025-01-15', through: '2026-01-15' },
    previous: { ...stats(460, 380), after: '2024-01-15', through: '2025-01-15' },
  },
};

function band(
  levelId: number,
  levelCode: string,
  median: number | null,
  stepFromBelowBp: number | null,
) {
  return {
    levelId,
    levelCode,
    headcount: median === null ? 4 : 40,
    typical:
      median === null ? null : { p25: median - 20_000_000, median, p75: median + 20_000_000 },
    stepFromBelowBp,
    aboveNextMedianCount: null,
    aboveNextMedianShareBp: null,
  };
}

const levelBands = {
  countryCode: 'IN',
  currencyCode: 'INR',
  levels: [
    band(1, 'L1', 100_000_000, null),
    band(2, 'L2', 135_000_000, 13_500),
    band(3, 'L3', null, null),
  ],
  summary: {
    stepRange: { minBp: 13_500, maxBp: 13_500 },
    largestOverlap: null,
    widestSpread: { levelCode: 'L1', spreadBp: 4000 },
  },
};

const attention = {
  asOf: '2026-01-15',
  activeHeadcount: 9577,
  outlierAbove: 142,
  outlierBelow: 45,
  outsidePeerRangeShareBp: 195,
  noRaise2y: 381,
  compression: {
    peopleCount: 23,
    groups: [
      {
        countryCode: 'IN',
        countryName: 'India',
        levelId: 2,
        levelCode: 'L2',
        recentCount: 6,
        tenuredCount: 15,
        recentMedianBaseMinor: 1_800_000,
        tenuredMedianBaseMinor: 1_600_000,
        gapBp: 1250,
      },
      {
        countryCode: 'IN',
        countryName: 'India',
        levelId: 3,
        levelCode: 'L3',
        recentCount: 5,
        tenuredCount: 8,
        recentMedianBaseMinor: 2_600_000,
        tenuredMedianBaseMinor: 2_400_000,
        gapBp: 833,
      },
    ],
  },
};

function stubInsights(overrides: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    'GET /api/insights/payroll-trend': payrollTrend,
    'GET /api/insights/payroll-change': payrollChange,
    'GET /api/insights/raises': raiseStats,
    'GET /api/insights/attention': attention,
    'GET /api/insights/level-bands': (url) =>
      Response.json({ ...levelBands, countryCode: url.searchParams.get('country') }),
    'GET /api/insights/distribution': (url) =>
      Response.json({
        baseCurrency: 'USD',
        groupBy: url.searchParams.get('groupBy'),
        groups: [{ key: 'IN', label: 'India', distribution }],
      }),
    'GET /api/insights/recent-changes': (url) => Response.json(recentChanges(url)),
    ...REFERENCE_ROUTES,
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
        'Figures for today cover active employees; trends include people who have since left · USD at FX rates of 15 Jan 2026 · Past years use the same rates',
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

  it('shows the five latest changes with a bulk revision as one row', async () => {
    const { calls } = stubInsights();
    renderWithQuery(<InsightsPage />);

    const card = screen.getByRole('region', { name: 'What changed recently?' });
    expect(await within(card).findByText('2 changes in the last 3 years.')).toBeDefined();
    const bulk = within(card).getByText('1,233 people · +3.57% · Annual increment 2026');
    expect(within(bulk.closest('li') as HTMLElement).getByText('Bulk revision')).toBeDefined();
    const row = within(card).getByRole('link', { name: 'Asha Rao' }).closest('li');
    expect(within(row as HTMLElement).getByText('Inactive')).toBeDefined();

    const requests = calls.filter((call) => call.url.pathname.endsWith('recent-changes'));
    expect(requests.map((call) => call.url.search)).toEqual(['?range=3y&limit=5&offset=0']);
  });

  it('sets the recent changes card to a year chosen in the raises card and clears it with the chip', async () => {
    const { calls } = stubInsights();
    renderWithQuery(<InsightsPage />);
    const lastRequest = () =>
      calls.filter((call) => call.url.pathname.endsWith('recent-changes')).at(-1)?.url.search;

    const raises = screen.getByRole('region', { name: 'What are we giving in raises?' });
    fireEvent.click(await within(raises).findByRole('button', { name: 'View as table' }));
    fireEvent.click(within(raises).getByRole('button', { name: 'Show changes in 2024' }));

    const card = screen.getByRole('region', { name: 'What changed recently?' });
    expect(await within(card).findByText('2 changes took effect in 2024.')).toBeDefined();
    expect(lastRequest()).toBe('?range=3y&year=2024&limit=5&offset=0');

    fireEvent.click(within(card).getByRole('button', { name: 'Remove year 2024' }));

    expect(await within(card).findByText('2 changes in the last 3 years.')).toBeDefined();
    expect(within(card).queryByRole('button', { name: 'Remove year 2024' })).toBeNull();
    await vi.waitFor(() => {
      expect(lastRequest()).toBe('?range=3y&limit=5&offset=0');
    });
  });

  it('links to the full list of changes', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    const card = screen.getByRole('region', { name: 'What changed recently?' });
    const link = await within(card).findByRole('link', { name: 'See all changes →' });
    expect(link.getAttribute('href')).toBe('/insights/changes');

    const raises = screen.getByRole('region', { name: 'What are we giving in raises?' });
    fireEvent.click(await within(raises).findByRole('button', { name: 'View as table' }));
    fireEvent.click(within(raises).getByRole('button', { name: 'Show changes in 2024' }));

    await within(card).findByText('2 changes took effect in 2024.');
    expect(within(card).getByRole('link', { name: 'See all changes →' }).getAttribute('href')).toBe(
      '/insights/changes?year=2024',
    );
  });

  it('answers the raises question and switches to the cost view', async () => {
    stubInsights();
    renderWithQuery(<InsightsPage />);

    const card = screen.getByRole('region', { name: 'What are we giving in raises?' });
    expect(
      await within(card).findByText(
        'Raises in the last 12 months averaged 4.4%, down from 4.6% the 12 months before. Raises and promotions added $19.2M to annual payroll.',
      ),
    ).toBeDefined();
    expect(
      within(card).getByText('Average raise per calendar year; raises within one currency only.'),
    ).toBeDefined();

    fireEvent.click(within(card).getByRole('radio', { name: '$ cost' }));

    expect(
      within(card).getByText(
        "Payroll added each calendar year by raises and promotions, in USD at today's FX rates.",
      ),
    ).toBeDefined();
    expect(
      within(card).queryByText('Average raise per calendar year; raises within one currency only.'),
    ).toBeNull();
  });

  it('selects a year from the raises table', async () => {
    stubApi({ 'GET /api/insights/raises': raiseStats });
    const onSelectYear = vi.fn();
    renderWithQuery(<RaisesCard onSelectYear={onSelectYear} />);

    const card = screen.getByRole('region', { name: 'What are we giving in raises?' });
    fireEvent.click(await within(card).findByRole('button', { name: 'View as table' }));

    const table = within(card).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .slice(0, 5)
        .map((header) => header.textContent),
    ).toEqual(['Year', 'Raises', 'Average raise', 'Added by raises', 'Added by promotions']);
    // 5Y is the default: this year and the four before it.
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.firstElementChild?.textContent),
    ).toEqual(['2022', '2023', '2024', '2025', '2026 (YTD)']);
    const row2024 = within(table).getByRole('row', { name: /^2024/ });
    expect(within(row2024).getByText('4.4%')).toBeDefined();
    expect(within(row2024).getByText('$15,200,000')).toBeDefined();

    fireEvent.click(within(card).getByRole('button', { name: 'Show changes in 2024' }));

    expect(onSelectYear).toHaveBeenCalledWith(2024);
  });

  it('shows level bands for the chosen country with a level too small to band', async () => {
    const { calls } = stubInsights();
    renderWithQuery(<InsightsPage />);

    const card = screen.getByRole('region', { name: 'Do levels mean consistent pay?' });
    expect(
      await within(card).findByText(
        'Each level pays 1.35× the one below. Pay varies most within L1.',
      ),
    ).toBeDefined();
    expect(within(card).getByRole('radio', { name: 'India' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(
      within(card).getByText(
        'Each bar spans the middle half of people at that level, in INR; the tick marks typical pay (median).',
      ),
    ).toBeDefined();

    fireEvent.click(within(card).getByRole('button', { name: 'View as table' }));

    const table = within(card).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Level',
      'People',
      'Bottom quarter',
      'Typical (median)',
      'Top quarter',
      'Step from level below',
    ]);
    const l2 = within(table).getByRole('row', { name: /L2/ });
    expect(within(l2).getByText('1.35×')).toBeDefined();
    const l3 = within(table).getByRole('row', { name: /L3/ });
    expect(within(l3).getByText('Too few people')).toBeDefined();

    fireEvent.click(within(card).getByRole('radio', { name: 'Germany' }));

    await vi.waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.url.pathname === '/api/insights/level-bands' && call.url.search === '?country=DE',
        ),
      ).toBe(true);
    });
    expect(
      calls.find((call) => call.url.pathname === '/api/insights/level-bands')?.url.search,
    ).toBe('?country=IN');
  });

  it('opens the full breakdown with plain column names', async () => {
    const { calls } = stubInsights();
    renderWithQuery(<InsightsPage />);

    const card = screen.getByRole('region', { name: 'Do levels mean consistent pay?' });
    const toggle = within(card).getByRole('button', { name: 'Full breakdown' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(calls.some((call) => call.url.pathname === '/api/insights/distribution')).toBe(false);

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const table = await within(card).findByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Group',
      'People',
      'Lowest',
      'Bottom quarter earn under',
      'Typical pay (median)',
      'Average',
      'Top quarter earn over',
      'Top 10% earn over',
      'Highest',
    ]);
    const india = within(table).getByRole('row', { name: /India/ });
    expect(within(india).getByText('$42,000')).toBeDefined();

    fireEvent.click(within(card).getByRole('radio', { name: 'Level' }));

    await vi.waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.url.pathname === '/api/insights/distribution' &&
            call.url.searchParams.get('groupBy') === 'level',
        ),
      ).toBe(true);
    });
  });

  it('links each attention row to the filtered employee list', async () => {
    stubInsights();
    const { unmount } = renderWithQuery(<InsightsPage />);

    const card = screen.getByRole('region', { name: 'Who needs attention?' });
    expect(
      await within(card).findByText(
        '187 people are paid outside their peer range and 381 have had no raise in over 2 years. In 2 country and level groups, new hires are paid more than long-tenured staff.',
      ),
    ).toBeDefined();

    const row = (title: string) => within(card).getByText(title).closest('li') as HTMLElement;
    const link = (title: string) =>
      within(row(title)).queryByRole('link', { name: 'View these people →' });

    expect(within(row('Outside peer range')).getByText('187')).toBeDefined();
    expect(within(row('Outside peer range')).getByText('142 above · 45 below')).toBeDefined();
    expect(link('Outside peer range')?.getAttribute('href')).toBe(
      '/employees?attention=outlier-above&attention=outlier-below',
    );
    expect(within(row('No raise in over 2 years')).getByText('381')).toBeDefined();
    expect(link('No raise in over 2 years')?.getAttribute('href')).toBe(
      '/employees?attention=no-raise-2y',
    );
    expect(within(row('Paid less than new hires')).getByText('23')).toBeDefined();
    expect(
      within(row('Paid less than new hires')).getByText(
        'Long-tenured staff in groups where people hired in the last year are paid more: India L2, India L3.',
      ),
    ).toBeDefined();
    expect(link('Paid less than new hires')?.getAttribute('href')).toBe(
      '/employees?attention=compression',
    );
    expect(within(card).queryByRole('button', { name: 'View as table' })).toBeNull();

    unmount();
    stubInsights({
      'GET /api/insights/attention': {
        ...attention,
        noRaise2y: 0,
        compression: { peopleCount: 0, groups: [] },
      },
    });
    renderWithQuery(<InsightsPage />);

    const emptyCard = screen.getByRole('region', { name: 'Who needs attention?' });
    await within(emptyCard).findByText(
      '187 people are paid outside their peer range and 0 have had no raise in over 2 years.',
    );
    const emptyRow = (title: string) =>
      within(emptyCard).getByText(title).closest('li') as HTMLElement;
    expect(within(emptyRow('No raise in over 2 years')).queryByRole('link')).toBeNull();
    expect(within(emptyRow('Paid less than new hires')).queryByRole('link')).toBeNull();
    expect(
      within(emptyRow('Paid less than new hires')).getByText(
        'No country and level where new hires are paid more.',
      ),
    ).toBeDefined();
    expect(within(emptyRow('Outside peer range')).getByRole('link')).toBeDefined();
  });

  it('shows the outside-peer-range tile in the warning colour only when above zero', async () => {
    stubInsights();
    const { unmount } = renderWithQuery(<InsightsPage />);

    const flagged = await within(tile('Paid outside peer range')).findByText('187');
    expect(flagged.className).toContain('text-warning');

    unmount();
    stubInsights({
      'GET /api/insights/attention': {
        ...attention,
        outlierAbove: 0,
        outlierBelow: 0,
        outsidePeerRangeShareBp: 0,
      },
    });
    renderWithQuery(<InsightsPage />);

    const clear = await within(tile('Paid outside peer range')).findByText('0');
    expect(clear.className).not.toContain('text-warning');
  });
});
