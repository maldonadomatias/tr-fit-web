import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAdminExercises } from '@/hooks/useAdminExercises';
import type { Exercise } from '@/types/api';

export function ExerciseSwapDialog({
  open,
  onClose,
  onSelect,
  title,
  muscleGroup,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (exerciseId: number, exercise: Exercise) => void;
  title: string;
  muscleGroup?: string;
}) {
  const [q, setQ] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(muscleGroup ?? '');
  useEffect(() => {
    if (open) {
      setQ('');
      setSelectedGroup(muscleGroup ?? '');
    }
  }, [open, muscleGroup]);
  const catalog = useAdminExercises({ archived: 'false', limit: 200 });
  const groups = [
    ...new Set(
      (catalog.data?.items ?? []).map((exercise) => exercise.muscle_group)
    ),
  ].sort();
  const { data } = useAdminExercises({
    q: q.trim() || undefined,
    muscle_group: selectedGroup || undefined,
    archived: 'false',
    // List the full group / catalog instead of the default page of 50.
    limit: 200,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Buscar ejercicio..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
            autoFocus
          />
        </div>
        <select
          aria-label="Grupo muscular"
          value={selectedGroup}
          onChange={(event) => setSelectedGroup(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todos los grupos musculares</option>
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
        <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-md border">
          {(data?.items ?? []).map((ex) => (
            <button
              key={ex.id}
              onClick={() => {
                onSelect(ex.id, ex);
                onClose();
              }}
              className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="font-medium">{ex.name}</span>
              <span className="text-xs text-muted-foreground">
                {ex.muscle_group} · {ex.equipment}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
