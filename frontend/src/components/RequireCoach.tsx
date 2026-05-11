import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function RequireCoach({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Cargando...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'coach') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
