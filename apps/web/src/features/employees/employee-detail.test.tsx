import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { employeeDetail, REFERENCE_ROUTES } from '@/test/fixtures';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { EmployeeDetailView } from './employee-detail';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderDetail(extra: Parameters<typeof stubApi>[0] = {}) {
  const stub = stubApi({
    ...REFERENCE_ROUTES,
    'GET /api/employees/1': () => Response.json(employeeDetail()),
    ...extra,
  });
  renderWithQuery(<EmployeeDetailView id={1} today="2026-10-19" />);
  return stub;
}

describe('EmployeeDetailView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the record, the current salary and the salary history newest first', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeDefined();
    expect(screen.getByText('asha.rao@acme.test')).toBeDefined();
    expect(screen.getByText('₹50,00,000.00 INR')).toBeDefined();
    const history = screen.getByRole('list', { name: 'Salary history' });
    const entries = within(history).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.textContent).toContain('Raise');
    expect(entries[0]?.textContent).toContain('₹50,00,000.00');
    expect(entries[1]?.textContent).toContain('Hire');
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

  it('deactivates after confirmation without sending a body or content type', async () => {
    const { fetchMock } = renderDetail({
      'DELETE /api/employees/1': () => Response.json(employeeDetail({ status: 'inactive' })),
    });
    await screen.findByRole('heading', { name: 'Asha Rao' });

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate' }),
    );

    expect(await screen.findByText('Inactive')).toBeDefined();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
    const init = call?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).has('content-type')).toBe(false);
  });

  it('reactivates an inactive employee without a body', async () => {
    const { fetchMock } = renderDetail({
      'GET /api/employees/1': () => Response.json(employeeDetail({ status: 'inactive' })),
      'POST /api/employees/1/reactivate': () => Response.json(employeeDetail()),
    });
    await screen.findByText('Inactive');

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

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

    expect(await screen.findByText(/Reactivate this employee to record/)).toBeDefined();
  });
});
