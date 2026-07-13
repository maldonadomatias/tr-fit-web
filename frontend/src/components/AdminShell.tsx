import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/admin/Sidebar';
import { Topbar } from '@/components/admin/Topbar';

export function AdminShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background lg:grid lg:h-screen lg:min-h-0 lg:grid-cols-[232px_1fr] lg:grid-rows-[56px_minmax(0,1fr)]">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <Topbar onMenuClick={() => setMobileNavOpen(true)} />
      <main className="min-h-0 overflow-auto p-4 sm:p-6 lg:col-start-2 lg:p-7">
        <div className="mx-auto max-w-[1240px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
