import { useState } from 'react';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateUser } from '@/hooks/useAdminUsers';
import type { Role, UserStatus } from '@/types/api';

const ROLES: Role[] = ['athlete', 'admin', 'superadmin'];
const STATUSES: UserStatus[] = ['pending', 'approved', 'rejected'];

interface Props {
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  trigger?: React.ReactNode;
}

export function CreateUserDialog({ open: openProp, onOpenChange, trigger }: Props = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('athlete');
  const [status, setStatus] = useState<UserStatus>('approved');
  const [verified, setVerified] = useState(true);
  const create = useCreateUser();

  function reset() {
    setEmail('');
    setPassword('');
    setRole('athlete');
    setStatus('approved');
    setVerified(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        email: email.trim().toLowerCase(),
        password,
        role,
        status,
        email_verified: verified,
      },
      {
        onSuccess: () => {
          toast.success('Usuario creado');
          reset();
          setOpen(false);
        },
        onError: (err: unknown) => {
          const e = err as AxiosError<{ error?: string }>;
          if (e.response?.data?.error === 'email_already_registered') {
            toast.error('Email ya registrado');
          } else {
            toast.error('No se pudo crear el usuario');
          }
        },
      },
    );
  }

  const controlled = openProp !== undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : !controlled ? (
        <DialogTrigger asChild>
          <Button size="sm">Nuevo usuario</Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cu-email">Email</Label>
            <Input
              id="cu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cu-password">Contraseña (mín. 8)</Label>
            <Input
              id="cu-password"
              type="password"
              value={password}
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Rol
            </Label>
            <div className="flex gap-1">
              {ROLES.map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={role === r ? 'default' : 'outline'}
                  onClick={() => setRole(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Estado
            </Label>
            <div className="flex gap-1">
              {STATUSES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={status === s ? 'default' : 'outline'}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            Email verificado
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
