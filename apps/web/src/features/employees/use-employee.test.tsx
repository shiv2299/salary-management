import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTERS } from './list-filters';
import { employeeDetail, employeeFacets, employeeItem } from '@/test/fixtures';
import { renderWithQuery, stubApi } from '@/test/render';
import { useEmployeeFacets, useEmployeeList } from './use-employees';
import { useSetEmployeeStatus } from './use-employee';

function Probe() {
  useEmployeeList(DEFAULT_FILTERS);
  const facets = useEmployeeFacets(DEFAULT_FILTERS);
  const deactivate = useSetEmployeeStatus(1);
  return (
    <>
      <span>{facets.data ? `active ${facets.data.statusTotal}` : 'loading'}</span>
      <button
        type="button"
        onClick={() => {
          deactivate.mutate('deactivate');
        }}
      >
        Deactivate
      </button>
    </>
  );
}

describe('employee writes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refetch the list and the filter counts so the panel and the result count stay right', async () => {
    let facetRequests = 0;
    const { calls } = stubApi({
      'GET /api/employees': { items: [employeeItem()], total: 1, limit: 50, offset: 0 },
      'GET /api/employees/facets': () => {
        facetRequests++;
        return Response.json(employeeFacets({ statusTotal: facetRequests === 1 ? 10 : 9 }));
      },
      'DELETE /api/employees/1': () => Response.json(employeeDetail({ status: 'inactive' })),
    });
    renderWithQuery(<Probe />);
    await screen.findByText('active 10');

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByText('active 9')).toBeDefined();
    await waitFor(() => {
      expect(calls.filter((call) => call.url.pathname === '/api/employees')).toHaveLength(2);
    });
  });
});
