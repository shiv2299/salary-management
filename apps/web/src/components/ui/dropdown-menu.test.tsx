import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

describe('DropdownMenu', () => {
  it('opens without locking page scroll or blocking the page', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open' }), { key: 'ArrowDown' });
    expect(await screen.findByRole('menuitem', { name: 'One' })).toBeDefined();
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
    expect(document.body.style.pointerEvents).toBe('');
  });

  it('reports a ticked checkbox item', async () => {
    const onCheckedChange = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked onCheckedChange={onCheckedChange}>
            Active only
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open' }), { key: 'ArrowDown' });
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Active only' });
    expect(item.getAttribute('aria-checked')).toBe('true');
    // The box is filled from its ancestor's state, so the item must be a `group` carrying data-state.
    const box = item.querySelector('[data-slot="checkbox-box"]');
    expect(item.getAttribute('data-state')).toBe('checked');
    expect(item.classList.contains('group')).toBe(true);
    expect(box?.classList.contains('group-data-[state=checked]:bg-primary')).toBe(true);
    fireEvent.click(item);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});
