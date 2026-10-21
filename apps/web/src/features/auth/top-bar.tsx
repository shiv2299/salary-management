'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppMark } from '@/components/ui/app-mark';
import { UserMenu } from './user-menu';

const links = [
  { href: '/insights', label: 'Insights' },
  { href: '/employees', label: 'Employees' },
];

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="border-b border-border bg-background">
      <div className="flex h-14 items-center gap-4 px-4 md:h-12 md:px-8">
        <AppMark nameClassName="hidden sm:inline" />
        <nav aria-label="Main" className="flex items-stretch gap-4 self-stretch">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center border-b-2 px-0.5 text-sm font-medium',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
