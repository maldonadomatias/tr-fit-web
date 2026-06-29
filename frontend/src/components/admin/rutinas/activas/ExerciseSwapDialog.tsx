import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAdminExercises } from '@/hooks/useAdminExercises';

export function ExerciseSwapDialog({
  open,
  onClose,
  onSelect,
  title,
  muscleGroup,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (exerciseId: number) => void;
  title: string;
  muscleGroup?: string;
}) {
  const [q, setQ] = useState('');
  const [onlyGroup, setOnlyGroup] = useState(true);
  const filterGroup = muscleGroup && onlyGroup ? muscleGroup : undefined;
  const { data } = useAdminExercises({
    q: q.trim() || undefined,
    muscle_group: filterGroup,
    archived: 'false',
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
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
        {muscleGroup ? (
          <button
            type="button"
            onClick={() => setOnlyGroup((v) => !v)}
            className={`self-start rounded-full border px-3 py-1 text-xs ${
              onlyGroup
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {onlyGroup ? `Solo ${muscleGroup}` : 'Todos los grupos'}
          </button>
        ) : null}
        <div className="max-h-96 divide-y divide-border overflow-y-auto rounded-md border">
          {(data?.items ?? []).map((ex) => (
            <button
              key={ex.id}
              onClick={() => {
                onSelect(ex.id);
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
