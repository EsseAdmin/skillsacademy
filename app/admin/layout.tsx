import type { ReactNode } from 'react';
import SiteHeader from '../_components/SiteHeader';

// The admin area keeps the plain wordmark header. It used to come from the root
// layout, but the root layout is now shared with the public marketing pages,
// which bring their own navigation.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
