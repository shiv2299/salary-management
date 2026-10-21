import { describe, expect, it } from 'vitest';
import { peerContext } from '@/test/fixtures';
import { comparisonSentence, outlierSentence, peerGroupLabel } from './peer-copy';

describe('peer copy', () => {
  it('names the peer group by country and level', () => {
    expect(peerGroupLabel(peerContext(), 'India')).toBe('India L3');
  });

  it('says in words when pay is outside the usual range', () => {
    expect(
      outlierSentence(peerContext({ position: { typical: 'above', outlier: 'above' } }), 'India'),
    ).toBe('Above the usual range for India L3');
    expect(
      outlierSentence(peerContext({ position: { typical: 'below', outlier: 'below' } }), 'India'),
    ).toBe('Below the usual range for India L3');
    expect(outlierSentence(peerContext(), 'India')).toBeNull();
  });

  it('says "still inside" only when the current pay was inside the same group', () => {
    expect(comparisonSentence(peerContext(), 'India', peerContext())).toBe(
      'Still inside the typical range for India L3',
    );
    expect(
      comparisonSentence(
        peerContext(),
        'India',
        peerContext({ position: { typical: 'below', outlier: null } }),
      ),
    ).toBe('Inside the typical range for India L3');
    expect(
      comparisonSentence(peerContext(), 'India', peerContext({ levelId: 4, levelCode: 'L4' })),
    ).toBe('Inside the typical range for India L3');
  });

  it('says above or below the typical range, and an outlier in the usual-range wording', () => {
    expect(
      comparisonSentence(
        peerContext({ position: { typical: 'above', outlier: null } }),
        'India',
        undefined,
      ),
    ).toBe('Above the typical range for India L3');
    expect(
      comparisonSentence(
        peerContext({ position: { typical: 'below', outlier: null } }),
        'India',
        undefined,
      ),
    ).toBe('Below the typical range for India L3');
    expect(
      comparisonSentence(
        peerContext({ position: { typical: 'above', outlier: 'above' } }),
        'India',
        undefined,
      ),
    ).toBe('Above the usual range for India L3');
  });

  it('says there are too few peers instead of naming a range', () => {
    expect(
      comparisonSentence(
        peerContext({ headcount: 4, typical: null, position: null }),
        'India',
        undefined,
      ),
    ).toBe('Too few India L3 peers to show a typical range');
  });
});
