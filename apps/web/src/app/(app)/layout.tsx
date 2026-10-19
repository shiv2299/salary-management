import type { ReactNode } from 'react';
import { AuthGuard } from '@/features/auth/auth-guard';
import { TopBar } from '@/features/auth/top-bar';

export default function AppLayout({
  children,
  drawer,
}: {
  children: ReactNode;
  drawer: ReactNode;
}) {
  return (
    <>
      <AuthGuard>
        <TopBar />
        <main className="flex flex-1 flex-col px-4 py-4 md:px-8 md:py-6">{children}</main>
        {drawer}
      </AuthGuard>
    </>
  );
}
