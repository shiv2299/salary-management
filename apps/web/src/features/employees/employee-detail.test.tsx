import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { employeeDetail, peerContext, REFERENCE_ROUTES } from '@/test/fixtures';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { EmployeeDetailView } from './employee-detail';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderDetail(extra: Parameters<typeof stubApi>[0] = {}) {
  const stub = stubApi({
    ...REFERENCE_ROUTES,
    'GET /api/employees/1': () => Response.json(employeeDetail()),
    'GET /api/employees/1/peer-context': () => Response.json(peerContext()),
    ...extra,
  });
  renderWithQuery(<EmployeeDetailView id={1} today="2026-10-19" />);
  return stub;
}

function showTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }));
}

describe('EmployeeDetailView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the name, job title, department, level and country in the header', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeDefined();
    expect(screen.getByText(/Software Engineer · Engineering/)).toBeDefined();
    expect(screen.getByText('L3')).toBeDefined();
    expect(await screen.findByText('India')).toBeDefined();
  });

  it('shows the current salary with its USD equivalent and the date it took effect', async () => {
    renderDetail();

    const tile = await screen.findByRole('group', { name: 'Current salary' });
    expect(within(tile).getByText('₹50,00,000.00')).toBeDefined();
    expect(within(tile).getByText('$59,900.00 · since 1 Apr 2025')).toBeDefined();
  });

  it('shows the date alone when the salary is already in US dollars', async () => {
    renderDetail({
      'GET /api/employees/1': () =>
        Response.json(
          employeeDetail({
            salary: {
              amountMinor: 9_000_000,
              currencyCode: 'USD',
              amountBaseMinor: 9_000_000,
              effectiveDate: '2025-04-01',
            },
          }),
        ),
    });

    const tile = await screen.findByRole('group', { name: 'Current salary' });
    expect(within(tile).getByText('since 1 Apr 2025')).toBeDefined();
  });

  it('shows the typical range and median of same-country same-level peers in local currency', async () => {
    renderDetail();

    const tile = await screen.findByRole('group', { name: 'Typical for India L3' });
    expect(within(tile).getByText('₹40,00,000 – ₹52,00,000')).toBeDefined();
    expect(within(tile).getByText('median ₹45,00,000 · 214 people')).toBeDefined();
  });

  it('says when the salary is above the usual range for the peer group', async () => {
    renderDetail({
      'GET /api/employees/1/peer-context': () =>
        Response.json(peerContext({ position: { typical: 'above', outlier: 'above' } })),
    });

    expect(await screen.findByText('Above the usual range for India L3')).toBeDefined();
  });

  it('says nothing about outliers when the salary is inside the usual range', async () => {
    renderDetail();
    await screen.findByRole('group', { name: 'Typical for India L3' });

    expect(screen.queryByText(/the usual range/)).toBeNull();
  });

  it('says there are too few peers when the group is under ten', async () => {
    renderDetail({
      'GET /api/employees/1/peer-context': () =>
        Response.json(peerContext({ headcount: 4, typical: null, position: null })),
    });

    expect(await screen.findByText('Too few India L3 peers to show a typical range')).toBeDefined();
  });

  it('opens on Change salary for an active employee and on Details for an inactive one', async () => {
    renderDetail();
    const change = await screen.findByRole('tab', { name: 'Change salary' });
    expect(change.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe(
      'false',
    );

    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    renderDetail({
      'GET /api/employees/1': () => Response.json(employeeDetail({ status: 'inactive' })),
    });
    const details = await screen.findByRole('tab', { name: 'Details' });
    expect(details.getAttribute('aria-selected')).toBe('true');
  });

  it('labels the history tab with the number of changes and shows the % change on each row', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: 'Asha Rao' });

    showTab('History (2)');

    const history = screen.getByRole('list', { name: 'Salary history' });
    const entries = within(history).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.textContent).toContain('Raise');
    expect(entries[0]?.textContent).toContain('₹50,00,000.00');
    expect(entries[0]?.textContent).toContain('+11.11%');
    expect(entries[1]?.textContent).toContain('Hire');
    expect(screen.getAllByText(/%/)).toHaveLength(1);
  });

  it('marks a change that came from a bulk revision', async () => {
    renderDetail({
      'GET /api/employees/1': () => {
        const detail = employeeDetail();
        return Response.json({
          ...detail,
          history: detail.history.map((entry, index) =>
            index === 0 ? { ...entry, batchId: 7 } : entry,
          ),
        });
      },
    });
    await screen.findByRole('heading', { name: 'Asha Rao' });

    showTab('History (2)');

    expect(screen.getAllByText('Bulk revision')).toHaveLength(1);
  });

  it('shows the not found message when the employee does not exist', async () => {
    renderDetail({ 'GET /api/employees/1': apiError(404, 'NOT_FOUND', 'Employee 1 not found') });

    expect((await screen.findByRole('alert')).textContent).toContain('Employee 1 not found');
  });

  it('edits the job title in place and saves just that field', async () => {
    const { calls } = renderDetail({
      'PATCH /api/employees/1': () => Response.json(employeeDetail({ jobTitle: 'Staff Engineer' })),
    });
    await screen.findByRole('heading', { name: 'Asha Rao' });
    showTab('Details');

    fireEvent.click(screen.getByRole('button', { name: 'Edit job title' }));
    const input = screen.getByLabelText('Job title');
    fireEvent.change(input, { target: { value: 'Staff Engineer' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      jobTitle: 'Staff Engineer',
    });
    expect(await screen.findByText('Staff Engineer')).toBeDefined();
  });

  it('deactivates from the actions menu after confirmation without sending a body', async () => {
    const { fetchMock } = renderDetail({
      'DELETE /api/employees/1': () => Response.json(employeeDetail({ status: 'inactive' })),
    });

    fireEvent.keyDown(await screen.findByRole('button', { name: 'More actions' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate…' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate' }),
    );

    expect(await screen.findByText('Inactive')).toBeDefined();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
    const init = call?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has('content-type')).toBe(false);
  });

  it('reactivates an inactive employee from the actions menu without a body', async () => {
    const { fetchMock } = renderDetail({
      'GET /api/employees/1': () => Response.json(employeeDetail({ status: 'inactive' })),
      'POST /api/employees/1/reactivate': () => Response.json(employeeDetail()),
    });
    await screen.findByText('Inactive');

    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reactivate' }));

    await waitFor(() => {
      expect(screen.queryByText('Inactive')).toBeNull();
    });
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect((call?.[1] as RequestInit).body).toBeUndefined();
  });

  it('does not offer salary changes for an inactive employee', async () => {
    renderDetail({
      'GET /api/employees/1': () => Response.json(employeeDetail({ status: 'inactive' })),
    });
    await screen.findByRole('heading', { name: /Asha Rao/ });

    showTab('Change salary');

    expect(await screen.findByText(/Reactivate this employee to record/)).toBeDefined();
  });
});
