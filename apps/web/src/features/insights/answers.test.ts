import type {
  AttentionResponse,
  LevelBandsResponse,
  PayrollChangeResponse,
  PayrollTrendResponse,
  RaiseStatsResponse,
} from '@acme/shared';
import { describe, expect, it } from 'vitest';
import {
  CAUSE_LABELS,
  attentionAnswer,
  averageRaiseVsBefore,
  changeVsYearAgo,
  countVsBefore,
  countVsYearAgo,
  formatRatioBp,
  levelBandsAnswer,
  payrollChangeAnswer,
  payrollTrendAnswer,
  raisesAnswer,
} from './answers';

const summary: PayrollTrendResponse['summary'] = {
  totalBaseMinor: 61_240_000_000,
  yearAgoTotalBaseMinor: 57_664_000_000,
  changeBp: 620,
  headcount: 9577,
  yearAgoHeadcount: 9265,
};

function change(
  changeBaseMinor: number,
  largestAddition: PayrollChangeResponse['largestAddition'],
  amounts: Partial<Record<PayrollChangeResponse['causes'][number]['cause'], number>> = {},
): PayrollChangeResponse {
  return {
    baseCurrency: 'USD',
    from: '2025-01-15',
    to: '2026-01-15',
    fromTotalBaseMinor: 58_830_000_000,
    toTotalBaseMinor: 58_830_000_000 + changeBaseMinor,
    changeBaseMinor,
    causes: (
      ['hires', 'raises', 'promotions', 'relocations', 'corrections', 'leavers'] as const
    ).map((cause) => ({ cause, amountBaseMinor: amounts[cause] ?? 0, count: 0 })),
    largestAddition,
  };
}

describe('payrollTrendAnswer', () => {
  it('says how much payroll rose and how many more people there are', () => {
    expect(payrollTrendAnswer(summary)).toBe(
      'Payroll is $612.4M a year, up 6.2% on 12 months ago, with 312 more people.',
    );
  });

  it('says how much payroll fell and how many fewer people there are', () => {
    expect(payrollTrendAnswer({ ...summary, changeBp: -120, yearAgoHeadcount: 9617 })).toBe(
      'Payroll is $612.4M a year, down 1.2% on 12 months ago, with 40 fewer people.',
    );
  });

  it('says payroll and headcount are unchanged when neither moved', () => {
    expect(payrollTrendAnswer({ ...summary, changeBp: 0, yearAgoHeadcount: 9577 })).toBe(
      'Payroll is $612.4M a year, the same as 12 months ago, with the same headcount.',
    );
  });

  it('gives only the total when there was no payroll a year ago', () => {
    expect(payrollTrendAnswer({ ...summary, changeBp: null })).toBe('Payroll is $612.4M a year.');
  });

  it('speaks of one person in the singular', () => {
    expect(payrollTrendAnswer({ ...summary, yearAgoHeadcount: 9576 })).toBe(
      'Payroll is $612.4M a year, up 6.2% on 12 months ago, with 1 more person.',
    );
  });
});

describe('payrollChangeAnswer', () => {
  it('says how much payroll rose and which cause added the most', () => {
    expect(payrollChangeAnswer(change(2_410_000_000, 'raises', { raises: 1_520_000_000 }))).toBe(
      'Payroll rose $24.1M in the last 12 months. Raises added the most: $15.2M.',
    );
  });

  it('says how much payroll fell and still names the cause that added the most', () => {
    expect(
      payrollChangeAnswer(
        change(-320_000_000, 'hires', { hires: 500_000_000, leavers: -820_000_000 }),
      ),
    ).toBe('Payroll fell $3.2M in the last 12 months. New hires added the most: $5M.');
  });

  it('leaves out the cause sentence when nothing added to payroll', () => {
    expect(payrollChangeAnswer(change(-320_000_000, null, { leavers: -320_000_000 }))).toBe(
      'Payroll fell $3.2M in the last 12 months.',
    );
  });

  it('says payroll is unchanged when the change is zero', () => {
    expect(payrollChangeAnswer(change(0, null))).toBe('Payroll is the same as 12 months ago.');
  });
});

describe('CAUSE_LABELS', () => {
  it('names every cause in plain words', () => {
    expect(Object.values(CAUSE_LABELS)).toEqual([
      'New hires',
      'Raises',
      'Promotions',
      'Relocations',
      'Corrections',
      'People who left',
    ]);
  });
});

describe('tile hints', () => {
  it('compares a percentage change with 12 months ago, with an arrow beside the number', () => {
    expect(changeVsYearAgo(620)).toBe('↑ 6.2% vs 12 months ago');
    expect(changeVsYearAgo(-120)).toBe('↓ 1.2% vs 12 months ago');
    expect(changeVsYearAgo(0)).toBe('No change vs 12 months ago');
    expect(changeVsYearAgo(null)).toBe('—');
  });

  it('compares a count with 12 months ago', () => {
    expect(countVsYearAgo(9577, 9265)).toBe('↑ 312 vs 12 months ago');
    expect(countVsYearAgo(9225, 9265)).toBe('↓ 40 vs 12 months ago');
    expect(countVsYearAgo(9265, 9265)).toBe('No change vs 12 months ago');
  });

  it('compares the average raise with the 12 months before', () => {
    expect(averageRaiseVsBefore(440, 460)).toBe('↓ from 4.6% the 12 months before');
    expect(averageRaiseVsBefore(480, 460)).toBe('↑ from 4.6% the 12 months before');
    expect(averageRaiseVsBefore(460, 460)).toBe('Same as the 12 months before');
    expect(averageRaiseVsBefore(440, null)).toBe('No raises the 12 months before');
    expect(averageRaiseVsBefore(null, 460)).toBe('No raises in the last 12 months');
  });

  it('compares a count with the 12 months before', () => {
    expect(countVsBefore(412, 380)).toBe('↑ from 380 the 12 months before');
    expect(countVsBefore(350, 380)).toBe('↓ from 380 the 12 months before');
    expect(countVsBefore(380, 380)).toBe('Same as the 12 months before');
    expect(countVsBefore(1412, 1380)).toBe('↑ from 1,380 the 12 months before');
  });
});

type Trailing = RaiseStatsResponse['trailing'];

function trailing(
  current: number | null,
  previous: number | null,
  totalAddedBaseMinor = 2_610_000_000,
): Trailing {
  const stats = (averageRaiseBp: number | null, total: number) => ({
    raiseCount: averageRaiseBp === null ? 0 : 3100,
    averageRaiseBp,
    raisesAddedBaseMinor: total,
    promotionCount: 0,
    promotionsAddedBaseMinor: 0,
    totalAddedBaseMinor: total,
  });
  return {
    current: { ...stats(current, totalAddedBaseMinor), after: '2025-01-15', through: '2026-01-15' },
    previous: { ...stats(previous, 0), after: '2024-01-15', through: '2025-01-15' },
  };
}

describe('raisesAnswer', () => {
  it('compares the average raise with the 12 months before and says what raises added', () => {
    expect(raisesAnswer(trailing(440, 460))).toBe(
      'Raises in the last 12 months averaged 4.4%, down from 4.6% the 12 months before. Raises and promotions added $26.1M to annual payroll.',
    );
  });

  it('says the average went up', () => {
    expect(raisesAnswer(trailing(440, 420))).toBe(
      'Raises in the last 12 months averaged 4.4%, up from 4.2% the 12 months before. Raises and promotions added $26.1M to annual payroll.',
    );
  });

  it('says the average stayed the same', () => {
    expect(raisesAnswer(trailing(440, 440))).toBe(
      'Raises in the last 12 months averaged 4.4%, the same as the 12 months before. Raises and promotions added $26.1M to annual payroll.',
    );
  });

  it('leaves out the comparison when there were no raises the 12 months before', () => {
    expect(raisesAnswer(trailing(440, null))).toBe(
      'Raises in the last 12 months averaged 4.4%. Raises and promotions added $26.1M to annual payroll.',
    );
  });

  it('says there were no raises in the last 12 months', () => {
    expect(raisesAnswer(trailing(null, 460, 0))).toBe('No raises in the last 12 months.');
  });

  it('leaves out what was added when raises and promotions added nothing', () => {
    expect(raisesAnswer(trailing(440, 460, 0))).toBe(
      'Raises in the last 12 months averaged 4.4%, down from 4.6% the 12 months before.',
    );
  });
});

function bands(summary: Partial<LevelBandsResponse['summary']> = {}): LevelBandsResponse {
  return {
    countryCode: 'IN',
    currencyCode: 'INR',
    levels: [],
    summary: {
      stepRange: { minBp: 13_500, maxBp: 14_000 },
      largestOverlap: { levelCode: 'L2', nextLevelCode: 'L3', shareBp: 1234, count: 40 },
      widestSpread: { levelCode: 'L5', spreadBp: 6000 },
      ...summary,
    },
  };
}

describe('levelBandsAnswer', () => {
  it('gives the range of steps, the largest overlap and the widest spread', () => {
    expect(levelBandsAnswer(bands(), 'India')).toBe(
      'Each level pays 1.35–1.4× the one below. 12.34% of L2s earn more than the typical L3. Pay varies most within L5.',
    );
  });

  it('gives one step when every level steps up by the same ratio', () => {
    expect(levelBandsAnswer(bands({ stepRange: { minBp: 14_000, maxBp: 14_000 } }), 'India')).toBe(
      'Each level pays 1.4× the one below. 12.34% of L2s earn more than the typical L3. Pay varies most within L5.',
    );
  });

  it('leaves out the overlap when no level overlaps the next', () => {
    expect(levelBandsAnswer(bands({ largestOverlap: null }), 'India')).toBe(
      'Each level pays 1.35–1.4× the one below. Pay varies most within L5.',
    );
  });

  it('says when too few people work in the country to compare levels', () => {
    expect(
      levelBandsAnswer(
        bands({ stepRange: null, largestOverlap: null, widestSpread: null }),
        'Germany',
      ),
    ).toBe('Too few people in Germany to compare levels.');
  });
});

function attention(
  outlierAbove: number,
  outlierBelow: number,
  noRaise2y: number,
  groups: [string, string][],
): AttentionResponse {
  return {
    asOf: '2026-01-15',
    activeHeadcount: 9577,
    outlierAbove,
    outlierBelow,
    outsidePeerRangeShareBp: 195,
    noRaise2y,
    compression: {
      peopleCount: groups.length * 10,
      groups: groups.map(([countryName, levelCode], index) => ({
        countryCode: countryName.slice(0, 2).toUpperCase(),
        countryName,
        levelId: index + 1,
        levelCode,
        recentCount: 5,
        tenuredCount: 10,
        recentMedianBaseMinor: 2_000_000,
        tenuredMedianBaseMinor: 1_800_000,
        gapBp: 1111,
      })),
    },
  };
}

describe('attentionAnswer', () => {
  it('counts people outside their peer range, without a recent raise, and the groups paying new hires more', () => {
    expect(
      attentionAnswer(
        attention(142, 45, 381, [
          ['India', 'L2'],
          ['India', 'L3'],
        ]),
      ),
    ).toBe(
      '187 people are paid outside their peer range and 381 have had no raise in over 2 years. In 2 country and level groups, new hires are paid more than long-tenured staff.',
    );
  });

  it('uses the singular for one person and one group', () => {
    expect(attentionAnswer(attention(1, 0, 1, [['India', 'L2']]))).toBe(
      '1 person is paid outside their peer range and 1 has had no raise in over 2 years. In 1 country and level group, new hires are paid more than long-tenured staff.',
    );
  });

  it('leaves out the new hires sentence when no group pays new hires more', () => {
    expect(attentionAnswer(attention(1200, 34, 0, []))).toBe(
      '1,234 people are paid outside their peer range and 0 have had no raise in over 2 years.',
    );
  });
});

describe('formatRatioBp', () => {
  it('writes a ratio in basis points as a multiple to two decimals at most', () => {
    expect(formatRatioBp(13_500)).toBe('1.35×');
    expect(formatRatioBp(16_000)).toBe('1.6×');
    expect(formatRatioBp(16_897)).toBe('1.69×');
    expect(formatRatioBp(10_000)).toBe('1×');
  });
});
