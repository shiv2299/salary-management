import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

const options = [
  { value: 'raise', label: 'Raise' },
  { value: 'promotion', label: 'Promotion' },
];

describe('SegmentedControl', () => {
  it('marks the selected option and reports a new choice', () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Reason" value="raise" options={options} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Raise' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Promotion' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Promotion' }));
    expect(onChange).toHaveBeenCalledWith('promotion');
  });
});
