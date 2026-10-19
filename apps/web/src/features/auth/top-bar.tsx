'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
        <span className="hidden text-base font-semibold text-text-primary sm:inline">
          Salary Management
        </span>
        <nav aria-label="Main" className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-11 items-center rounded-sm px-2.5 text-sm font-medium md:h-8',
                  active ? 'bg-primary/10 text-primary' : 'text-text-primary hover:bg-surface',
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
