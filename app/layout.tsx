import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Skill Academies',
  description: 'Run your academy’s courses, modules, and live sessions in one place.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {/* Every page — including the admin area and the 404 — carries this
            wordmark so the site name always leads back to the home page. */}
        <header className="border-b border-gray-200">
          <div className="mx-auto flex max-w-2xl items-center px-6 py-4">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-gray-900 hover:text-teal-700"
            >
              Skill Academies
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
