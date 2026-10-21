import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

describe('Tabs', () => {
  it('shows the panel of the chosen tab', () => {
    render(
      <Tabs defaultValue="change">
        <TabsList>
          <TabsTrigger value="change">Change salary</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="change">change body</TabsContent>
        <TabsContent value="details">details body</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel').textContent).toContain('change body');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByRole('tabpanel').textContent).toContain('details body');
    expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true');
  });
});
