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
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (exerciseId: number) => void;
  title: string;
}) {
  const [q, setQ] = useState('');
  const { data } = useAdminExercises({
    q: q.trim() || undefined,
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
