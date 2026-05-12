import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { clearAuth } from '@/lib/auth-storage';
import { AxiosError } from 'axios';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email.trim().toLowerCase(), password);
      if (user.role !== 'coach') {
        clearAuth();
        toast.error('Esta cuenta no tiene permisos de coach');
        return;
      }
      navigate('/coach');
    } catch (err) {
      const e = err as AxiosError<{ error?: string; reason?: string }>;
      const body = e.response?.data;
      if (body?.error === 'invalid_credentials') {
        toast.error('Email o contraseña incorrectos');
      } else if (body?.error === 'blocked' && body.reason === 'email_not_verified') {
        toast.error('Verificá tu email antes de iniciar sesión');
      } else if (body?.error === 'rate_limited') {
        toast.error('Demasiados intentos. Esperá unos minutos.');
      } else {
        toast.error('No se pudo iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">TR-FIT Coach</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoCapitalize="none"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Iniciando...' : 'Iniciar sesión'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
