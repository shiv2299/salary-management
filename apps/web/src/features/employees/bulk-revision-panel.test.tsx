import type { BulkPreviewItem } from '@acme/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bulkPreviewItem } from '@/test/fixtures';
import { apiError, renderWithQuery, stubApi } from '@/test/render';
import { BulkRevisionPanel } from './bulk-revision-panel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function previewItem(id: number, overrides: Partial<BulkPreviewItem> = {}): BulkPreviewItem {
  return bulkPreviewItem({
    employeeId: id,
    firstName: `First${id}`,
    lastName: `Last${id}`,
    countryCode: 'US',
    departmentName: 'Engineering',
    levelCode: 'L3',
    currencyCode: 'USD',
    currentAmountMinor: 100_000_00,
    proposedAmountMinor: 107_000_00,
    ...overrides,
  });
}

function previewResponse(items: BulkPreviewItem[]) {
  return { items, total: items.length };
}

function renderPanel(props: Partial<React.ComponentProps<typeof BulkRevisionPanel>> = {}) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  renderWithQuery(
    <BulkRevisionPanel
      target={{ filter: { country: ['US'] } }}
      defaultNote="Engineering L3 United States"
      today="2026-10-19"
      onClose={onClose}
      onDone={onDone}
      {...props}
    />,
  );
  return { onClose, onDone };
}

function requestPreview(percentage = '7') {
  fireEvent.change(screen.getByLabelText('Percentage increase'), { target: { value: percentage } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
}

describe('BulkRevisionPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for a valid percentage before calling the server', async () => {
    const { fetchMock } = stubApi({});
    renderPanel();

    requestPreview('abc');

    expect(await screen.findByText(/between 0.01 and 100/)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('previews in basis points for the chosen filter', async () => {
    const { calls } = stubApi({
      'POST /api/employees/bulk-salary-changes/preview': previewResponse([previewItem(1)]),
    });
    renderPanel();

    requestPreview('7');

    await screen.findByText('First1 Last1');
    expect(calls[0]?.body).toEqual({ filter: { country: ['US'] }, percentageBp: 700 });
  });

  it('summarises the batch and marks a hand-overridden amount', async () => {
    stubApi({
      'POST /api/employees/bulk-salary-changes/preview': previewResponse([
        previewItem(1),
        previewItem(2),
      ]),
    });
    renderPanel();
    requestPreview();
    await screen.findByText('First1 Last1');
    expect(
      screen.getByText(/2 employees · 0 overridden · total increase \$14,000\.00/),
    ).toBeDefined();

    const cell = screen.getByLabelText('New amount for First2 Last2');
    fireEvent.change(cell, { target: { value: '110000' } });

    expect(
      screen.getByText(/2 employees · 1 overridden · total increase \$17,000\.00/),
    ).toBeDefined();
    expect(cell.getAttribute('data-overridden')).toBe('true');
    expect(
      screen.getByLabelText('New amount for First1 Last1').getAttribute('data-overridden'),
    ).toBeNull();
  });

  it('confirms exactly the previewed list with overrides and the amounts the preview was based on', async () => {
    const { calls } = stubApi({
      'POST /api/employees/bulk-salary-changes/preview': previewResponse([
        previewItem(1),
        previewItem(2),
      ]),
      'POST /api/employees/bulk-salary-changes': () =>
        Response.json(
          { batchId: 4, employeeCount: 2, effectiveDate: '2026-10-19' },
          { status: 201 },
        ),
    });
    const { onDone } = renderPanel();
    requestPreview();
    await screen.findByText('First1 Last1');
    fireEvent.change(screen.getByLabelText('New amount for First2 Last2'), {
      target: { value: '110000' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2 employees' }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    const confirm = calls.find((call) => call.url.pathname.endsWith('bulk-salary-changes'));
    expect(confirm?.body).toEqual({
      percentageBp: 700,
      effectiveDate: '2026-10-19',
      note: 'Engineering L3 United States',
      items: [
        { employeeId: 1, expectedCurrentAmountMinor: 100_000_00, newAmountMinor: 107_000_00 },
        { employeeId: 2, expectedCurrentAmountMinor: 100_000_00, newAmountMinor: 110_000_00 },
      ],
    });
  });

  it('disables the confirm button while an override is not a valid raise', async () => {
    stubApi({
      'POST /api/employees/bulk-salary-changes/preview': previewResponse([previewItem(1)]),
    });
    renderPanel();
    requestPreview();
    await screen.findByText('First1 Last1');

    fireEvent.change(screen.getByLabelText('New amount for First1 Last1'), {
      target: { value: '90000' },
    });

    expect(screen.getByRole('button', { name: /Apply to/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Must be higher than the current amount')).toBeDefined();
  });

  it('pages through the full preview locally and keeps overrides across pages', async () => {
    const items = Array.from({ length: 120 }, (_, index) => previewItem(index + 1));
    const { calls } = stubApi({
      'POST /api/employees/bulk-salary-changes/preview': previewResponse(items),
    });
    renderPanel();
    requestPreview();
    await screen.findByText('First1 Last1');
    fireEvent.change(screen.getByLabelText('New amount for First1 Last1'), {
      target: { value: '120000' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('First51 Last51')).toBeDefined();
    expect(screen.queryByText('First1 Last1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByLabelText<HTMLInputElement>('New amount for First1 Last1').value).toBe(
      '120000',
    );
    expect(calls).toHaveLength(1);
  });

  it('tells the user to preview again when the preview is stale and keeps overrides for unaffected people', async () => {
    let previews = 0;
    stubApi({
      'POST /api/employees/bulk-salary-changes/preview': () => {
        previews += 1;
        return Response.json(
          previewResponse(
            previews === 1
              ? [previewItem(1), previewItem(2)]
              : [
                  previewItem(1),
                  previewItem(2, {
                    currentAmountMinor: 105_000_00,
                    proposedAmountMinor: 112_350_00,
                  }),
                ],
          ),
        );
      },
      'POST /api/employees/bulk-salary-changes': apiError(
        409,
        'CONFLICT',
        'Salaries changed since the preview. Preview again.',
      ),
    });
    renderPanel();
    requestPreview();
    await screen.findByText('First1 Last1');
    fireEvent.change(screen.getByLabelText('New amount for First1 Last1'), {
      target: { value: '120000' },
    });
    fireEvent.change(screen.getByLabelText('New amount for First2 Last2'), {
      target: { value: '121000' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2 employees' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Preview again');
    await waitFor(() => {
      expect(previews).toBe(2);
    });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('New amount for First1 Last1').value).toBe(
        '120000',
      );
    });
    expect(screen.getByLabelText<HTMLInputElement>('New amount for First2 Last2').value).toBe(
      '112350.00',
    );
  });

  it('shows the rule that was broken on a 422 without reloading the preview', async () => {
    let previews = 0;
    stubApi({
      'POST /api/employees/bulk-salary-changes/preview': () => {
        previews += 1;
        return Response.json(previewResponse([previewItem(1)]));
      },
      'POST /api/employees/bulk-salary-changes': apiError(
        422,
        'UNPROCESSABLE',
        'Effective date cannot be in the future',
      ),
    });
    renderPanel();
    requestPreview();
    await screen.findByText('First1 Last1');

    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 employee' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Effective date cannot be in the future',
    );
    expect(previews).toBe(1);
  });
});
