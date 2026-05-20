import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/admin/Sidebar';
import { Topbar } from '@/components/admin/Topbar';

export function AdminShell() {
  return (
    <div className="grid min-h-screen grid-cols-[232px_1fr] grid-rows-[56px_1fr] bg-background">
      <Sidebar />
      <Topbar />
      <main className="col-start-2 overflow-auto p-7">
        <div className="mx-auto max-w-[1240px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
