import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="grid min-h-screen grid-cols-[232px_1fr] grid-rows-[56px_1fr] bg-background">
        <Skeleton className="row-span-2 border-r" />
        <Skeleton className="col-start-2 border-b" />
        <div className="col-start-2 p-7">
          <Skeleton className="mb-6 h-9 w-72" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[140px] rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin' && user.role !== 'superadmin') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
