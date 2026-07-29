import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Skill Academies',
  description: 'Run your academy’s courses, modules, and live sessions in one place.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* Deliberately bare: the public marketing pages bring their own dark
          navigation and footer, while the admin area and the 404 page render the
          Skill Academies wordmark themselves. */}
      <body className="min-h-screen bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
