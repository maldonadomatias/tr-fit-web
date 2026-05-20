import { Badge } from '@/components/ui/badge';
import type { Role } from '@/types/api';

const LABELS: Record<Role, string> = {
  athlete: 'Atleta',
  admin: 'Admin',
  superadmin: 'Superadmin',
};

export function RoleBadge({ role }: { role: Role }) {
  if (role === 'superadmin') {
    return <Badge variant="default">{LABELS.superadmin}</Badge>;
  }
  return <Badge variant="muted">{LABELS[role]}</Badge>;
}
