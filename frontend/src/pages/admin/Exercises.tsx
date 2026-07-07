import { useMemo, useState } from 'react';
import { Plus, Pencil, Archive, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/admin/PageHeader';
import { ExerciseDialog } from '@/components/admin/exercises/ExerciseDialog';
import {
  useAdminExercises,
  useArchiveExercise,
  useRestoreExercise,
} from '@/hooks/useAdminExercises';
import type { Equipment, Exercise, MovementPattern } from '@/types/api';
import { cn } from '@/lib/utils';

const EQUIPMENT: Equipment[] = [
  'barra', 'mancuerna', 'maquina', 'polea', 'smith', 'bw', 'pesa_rusa', 'elastico', 'disco',
];
const PATTERNS: MovementPattern[] = [
  'squat', 'hinge', 'push_h', 'push_v', 'pull_h', 'pull_v', 'isolation', 'core', 'cardio',
];

export default function Exercises() {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string>('all');
  const [eq, setEq] = useState<Equipment | 'all'>('all');
  const [pattern, setPattern] = useState<MovementPattern | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 50;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);

  const filters = useMemo(() => ({
    q: q.trim() || undefined,
    muscle_group: muscle === 'all' ? undefined : muscle,
    equipment: eq === 'all' ? undefined : eq,
    movement_pattern: pattern === 'all' ? undefined : pattern,
    archived: (showArchived ? 'all' : 'false') as 'all' | 'false',
    limit,
    offset: page * limit,
  }), [q, muscle, eq, pattern, showArchived, page]);

  const query = useAdminExercises(filters);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const muscleGroups = useMemo(() => {
    const set = new Set(items.map((e) => e.muscle_group));
    return Array.from(set).sort();
  }, [items]);

  const archive = useArchiveExercise();
  const restore = useRestoreExercise();

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(e: Exercise) {
    setEditing(e);
    setDialogOpen(true);
  }

  return (
    <div>
      <PageHeader
        eyebrow="02 — Gestión"
        title="Ejercicios"
        sub={<span className="text-sm text-muted-foreground">{total} ejercicios</span>}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1 size-4" /> Nuevo ejercicio
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Buscar por nombre…"
            className="w-full pl-8"
          />
        </div>
        <Select value={muscle} onValueChange={(v) => { setMuscle(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Grupo muscular" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los grupos</SelectItem>
            {muscleGroups.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={eq} onValueChange={(v) => { setEq(v as Equipment | 'all'); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Equipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {EQUIPMENT.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={pattern} onValueChange={(v) => { setPattern(v as MovementPattern | 'all'); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Patrón" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {PATTERNS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm sm:ml-2">
          <Switch checked={showArchived} onCheckedChange={(c) => { setShowArchived(c); setPage(0); }} />
          Mostrar archivados
        </label>
      </div>

      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Grupo</TableHead>
            <TableHead>Equipo</TableHead>
            <TableHead>Patrón</TableHead>
            <TableHead>Principal</TableHead>
            <TableHead>Unilateral</TableHead>
            <TableHead>Nivel</TableHead>
            <TableHead>Tope</TableHead>
            <TableHead className="w-24">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading && (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell>
              </TableRow>
            ))
          )}
          {!query.isLoading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                No hay ejercicios. Crea uno con el botón de arriba.
              </TableCell>
            </TableRow>
          )}
          {items.map((e) => {
            const archived = e.archived_at != null;
            return (
              <TableRow
                key={e.id}
                className={cn('cursor-pointer', archived && 'opacity-50')}
                onClick={() => openEdit(e)}
              >
                <TableCell className="font-medium">
                  {e.name}
                  {archived && <Badge variant="secondary" className="ml-2">Archivado</Badge>}
                </TableCell>
                <TableCell>{e.muscle_group}</TableCell>
                <TableCell>{e.equipment}</TableCell>
                <TableCell>{e.movement_pattern}</TableCell>
                <TableCell>{e.is_principal ? 'Sí' : '—'}</TableCell>
                <TableCell>{e.is_unilateral ? 'Sí' : '—'}</TableCell>
                <TableCell>{e.level_min}</TableCell>
                <TableCell>{e.rep_cycle_threshold}</TableCell>
                <TableCell onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(e)}>
                      <Pencil className="size-4" />
                    </Button>
                    {archived ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => restore.mutate(e.id)}
                        aria-label="Restaurar"
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => archive.mutate(e.id)}
                        aria-label="Archivar"
                      >
                        <Archive className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            página {page + 1} de {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente →
          </Button>
        </div>
      )}

      <ExerciseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        exercise={editing}
      />
    </div>
  );
}
