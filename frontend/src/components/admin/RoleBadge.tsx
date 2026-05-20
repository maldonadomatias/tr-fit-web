import { Badge } from '@/components/ui/badge';
import type { Role } from '@/types/api';

// TODO(Task 3): remove coach label once role is fully collapsed
const LABELS: Record<Role, string> = {
  athlete: 'Atleta',
  admin: 'Admin',
  superadmin: 'Superadmin',
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant="muted">{LABELS[role] ?? role}</Badge>;
}
