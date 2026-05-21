import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRight, Eye, EyeOff, Mail, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { clearAuth } from '@/lib/auth-storage';
import { authErrorMessage } from '@/lib/auth-errors';
import { loginSchema, type LoginValues } from '@/lib/auth-schemas';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { AuthField } from '@/components/auth/AuthField';
import { AuthAlert } from '@/components/auth/AuthAlert';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginValues) {
    setError(null);
    try {
      const user = await login(values.email.trim().toLowerCase(), values.password);
      if (user.role === 'admin' || user.role === 'superadmin') {
        navigate('/admin');
      } else {
        clearAuth();
        setError('Esta cuenta no tiene acceso a la consola web.');
      }
    } catch (err) {
      const { message } = authErrorMessage(err);
      setError(message || 'No se pudo iniciar sesión');
    }
  }

  return (
    <AuthLayout>
      <AuthHeader
        eyebrow="Iniciar sesión"
        title="Bienvenido de vuelta"
        sub="Entrá a tu consola para seguir donde lo dejaste."
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {error && <AuthAlert>{error}</AuthAlert>}

        <AuthField
          id="email"
          type="email"
          label="Email"
          icon={<Mail size={16} />}
          placeholder="vos@equipo.com"
          autoCapitalize="off"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="mt-[18px]">
          <AuthField
            id="password"
            type={show ? 'text' : 'password'}
            label="Contraseña"
            icon={<Shield size={16} />}
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            affix={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
            {...register('password')}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand text-sm font-semibold text-brand-foreground transition-[filter,transform] duration-150 hover:brightness-95 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Iniciando...' : 'Iniciar sesión'}
          {!isSubmitting && <ArrowUpRight size={14} />}
        </button>
      </form>
    </AuthLayout>
  );
}
