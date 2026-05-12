import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { SkeletonSlot } from '@/types/api';

const DAYS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function SkeletonReviewTable({ slots }: { slots: SkeletonSlot[] }) {
  const byDay = new Map<number, SkeletonSlot[]>();
  for (const s of slots) {
    if (!byDay.has(s.day_of_week)) byDay.set(s.day_of_week, []);
    byDay.get(s.day_of_week)!.push(s);
  }
  const dayKeys = Array.from(byDay.keys()).sort();

  return (
    <div className="space-y-6">
      {dayKeys.map((day) => (
        <div key={day}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Día {day} · {DAYS[day]}
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Ejercicio</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Rol</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDay
                .get(day)!
                .sort((a, b) => a.slot_index - b.slot_index)
                .map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">
                      {s.slot_index}
                    </TableCell>
                    <TableCell className="font-medium">{s.exercise_name}</TableCell>
                    <TableCell>{s.muscle_group}</TableCell>
                    <TableCell className="capitalize">{s.equipment}</TableCell>
                    <TableCell>
                      <Badge variant={s.role === 'principal' ? 'default' : 'outline'}>
                        {s.role}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
