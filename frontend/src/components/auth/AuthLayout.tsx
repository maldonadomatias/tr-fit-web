import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandPanel } from './BrandPanel';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen bg-background md:grid"
      style={{
        gridTemplateColumns: 'minmax(420px, 1fr) minmax(520px, 1fr)',
      }}
    >
      <BrandPanel />
      <div className="relative flex min-h-screen flex-col items-center justify-center p-10 md:min-h-0">
        <div className="w-full max-w-[400px]">{children}</div>
        <footer className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
          <span>TR-Fit · 2026</span>
          <Link to="/terms" className="hover:text-foreground">
            Términos
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacidad
          </Link>
          <Link to="/support" className="hover:text-foreground">
            Ayuda
          </Link>
        </footer>
      </div>
    </div>
  );
}
