import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            TR-Fit
          </Link>
          <nav className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Términos
            </Link>
            <Link to="/support" className="hover:text-foreground">
              Soporte
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última actualización: {updated}
        </p>
        <div className="mt-8 space-y-6 text-sm leading-6 text-foreground [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:text-foreground [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1 [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>TR-Fit · 2026</span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Términos
            </Link>
            <Link to="/support" className="hover:text-foreground">
              Soporte
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
