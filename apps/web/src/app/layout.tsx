import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Salary Management',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-border">
          <div className="flex h-12 items-center px-4 md:px-8">
            <span className="text-base font-semibold text-text-primary">Salary Management</span>
          </div>
        </header>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
