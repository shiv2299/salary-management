import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, initials } from './avatar';
import { CheckboxGroup } from './checkbox-group';
import { Chip } from './chip';
import { CountryFlag } from './country-flag';
import { LevelBadge } from './level-badge';
import { StatTile } from './stat-tile';

describe('building blocks', () => {
  it('makes initials from the first and last words of a name', () => {
    expect(initials('Asha Rao')).toBe('AR');
    expect(initials('mary ann de souza')).toBe('MS');
    expect(initials('Prince')).toBe('P');
    expect(initials('   ')).toBe('?');
  });

  it('hides the avatar from assistive technology', () => {
    const { container } = render(<Avatar name="Asha Rao" />);
    const avatar = container.firstElementChild;
    expect(avatar?.getAttribute('aria-hidden')).toBe('true');
    expect(avatar?.textContent).toBe('AR');
  });

  it('shows a flag and the country name, falling back to the code when there is no flag', () => {
    const { container } = render(
      <>
        <CountryFlag code="IN" name="India" />
        <CountryFlag code="BR" name="Brazil" />
      </>,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByText('India')).toBeDefined();
    expect(container.querySelector('[data-fallback]')?.textContent).toBe('BR');
  });

  it('removes a chip from its own button', () => {
    const onRemove = vi.fn();
    render(<Chip label="India" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter India' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('adds and removes values and ties each count to its checkbox', () => {
    const onChange = vi.fn();
    render(
      <CheckboxGroup
        legend="Country"
        selected={['IN']}
        onChange={onChange}
        options={[
          { value: 'IN', label: 'India', count: 120 },
          { value: 'DE', label: 'Germany', count: 0 },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Germany' }));
    expect(onChange).toHaveBeenLastCalledWith(['IN', 'DE']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'India' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    const india = screen.getByRole('checkbox', { name: 'India' });
    expect(document.getElementById(india.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      '120',
    );
    expect(screen.getByRole('group', { name: 'Country' })).toBeDefined();
  });

  it('groups the thousands in a count', () => {
    render(
      <CheckboxGroup
        legend="Country"
        selected={[]}
        onChange={vi.fn()}
        options={[{ value: 'IN', label: 'India', count: 3355 }]}
      />,
    );
    const india = screen.getByRole('checkbox', { name: 'India' });
    expect(document.getElementById(india.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      '3,355',
    );
  });

  it('tints the ticked options with the accent fill and leaves the others plain', () => {
    render(
      <CheckboxGroup
        legend="Level"
        selected={[1]}
        onChange={() => {}}
        options={[
          { value: 1, label: 'L1' },
          { value: 2, label: 'L2' },
        ]}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'L1' }).closest('label')?.className).toContain(
      'bg-accent-tint',
    );
    expect(screen.getByRole('checkbox', { name: 'L2' }).closest('label')?.className).not.toContain(
      'bg-accent-tint',
    );
  });

  it('keeps zero-count options enabled', () => {
    render(
      <CheckboxGroup
        legend="Level"
        selected={[]}
        onChange={() => {}}
        options={[{ value: 1, label: 'L1', count: 0 }]}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'L1' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows a stat tile with its label, value and hint', () => {
    render(<StatTile label="Current salary" value="₹50,00,000" hint="since 1 Apr 2025" />);
    const tile = screen.getByRole('group', { name: 'Current salary' });
    expect(within(tile).getByText('₹50,00,000')).toBeDefined();
    expect(within(tile).getByText('since 1 Apr 2025')).toBeDefined();
  });

  it('shows a level as a badge', () => {
    render(<LevelBadge code="L3" />);
    expect(screen.getByText('L3')).toBeDefined();
  });
});
