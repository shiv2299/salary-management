'use client';

import * as React from 'react';
import { cn } from 'cn';
import { Tabs as Primitive } from 'radix-ui';

const Tabs = Primitive.Root;

function TabsList({ className, ...props }: React.ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List className={cn('flex gap-4 border-b border-border', className)} {...props} />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        '-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 border-transparent px-1 text-sm font-medium text-text-secondary hover:text-text-primary data-[state=active]:border-primary data-[state=active]:text-text-primary md:h-9',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Content className={cn('pt-4 outline-none', className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
