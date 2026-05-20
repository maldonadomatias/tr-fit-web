import { Badge } from '@/components/ui/badge';
import type { Role } from '@/types/api';

const LABELS: Record<Role, string> = {
  athlete: 'Atleta',
  coach: 'Coach',
  admin: 'Admin',
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant="muted">{LABELS[role] ?? role}</Badge>;
}
