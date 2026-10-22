import { REFERENCE_ROUTES } from '@/test/fixtures';
import { describe, expect, it } from 'vitest';
import {
  bulkDefaultNote,
  bulkRevisionHref,
  listHrefFrom,
  MAX_PICKED_IDS,
  selectionFromParams,
} from './selection';

describe('bulk selection in the URL', () => {
  it('carries the list query and the picked ids, in order, into the revision address', () => {
    expect(bulkRevisionHref('country=IN&sortBy=salary', { ids: [12, 3] })).toBe(
      '/employees/revisions/new?country=IN&sortBy=salary&ids=3,12',
    );
    expect(bulkRevisionHref('', { ids: [1] })).toBe('/employees/revisions/new?ids=1');
  });

  it('carries everyone matching the list as select=all', () => {
    expect(bulkRevisionHref('country=IN&level=3', { all: true })).toBe(
      '/employees/revisions/new?country=IN&level=3&select=all',
    );
  });

  it('reads picked ids back once each', () => {
    expect(selectionFromParams(new URLSearchParams('country=IN&ids=3,12,3'))).toEqual({
      employeeIds: [3, 12],
    });
  });

  it('reads select=all back as the list filters a bulk revision understands', () => {
    expect(
      selectionFromParams(
        new URLSearchParams('country=IN&status=all&search=ann&page=3&select=all'),
      ),
    ).toEqual({ filter: { search: 'ann', country: ['IN'] } });
    expect(selectionFromParams(new URLSearchParams('select=all&ids=3'))).toEqual({ filter: {} });
  });

  it('finds no selection in a missing, malformed or oversized one', () => {
    for (const query of ['', 'country=IN', 'ids=', 'ids=abc', 'ids=1,x', 'ids=0', 'select=some']) {
      expect(selectionFromParams(new URLSearchParams(query))).toBeNull();
    }
    const tooMany = Array.from({ length: MAX_PICKED_IDS + 1 }, (_, i) => i + 1).join(',');
    expect(selectionFromParams(new URLSearchParams(`ids=${tooMany}`))).toBeNull();
  });

  it('links back to the list with its own query and without the selection', () => {
    expect(listHrefFrom(new URLSearchParams('country=IN&page=2&ids=3'))).toBe(
      '/employees?country=IN&page=2',
    );
    expect(listHrefFrom(new URLSearchParams('select=all'))).toBe('/employees');
  });

  it('names the revision after the filters that chose everyone, or as a hand-picked set', () => {
    const ref = {
      countries: REFERENCE_ROUTES['GET /api/reference/countries'],
      departments: REFERENCE_ROUTES['GET /api/reference/departments'],
      levels: REFERENCE_ROUTES['GET /api/reference/levels'],
    };
    expect(bulkDefaultNote({ filter: { department: [1], level: [3], country: ['IN'] } }, ref)).toBe(
      'Engineering, L3, India',
    );
    expect(bulkDefaultNote({ filter: {} }, ref)).toBe('All matching employees');
    expect(bulkDefaultNote({ employeeIds: [1] }, ref)).toBe('Selected employees');
  });
});
