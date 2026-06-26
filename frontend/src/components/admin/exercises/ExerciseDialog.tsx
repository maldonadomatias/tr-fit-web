import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useCreateExercise,
  useUpdateExercise,
  useArchiveExercise,
  useRestoreExercise,
  type CreateExerciseInput,
} from '@/hooks/useAdminExercises';
import type { Exercise } from '@/types/api';

const EQUIPMENT = [
  'barra', 'mancuerna', 'maquina', 'polea', 'smith', 'bw', 'pesa_rusa', 'elastico', 'disco',
] as const;
const PATTERNS = [
  'squat', 'hinge', 'push_h', 'push_v', 'pull_h', 'pull_v', 'isolation', 'core', 'cardio',
] as const;
const LEVELS = ['principiante', 'intermedio', 'avanzado'] as const;
const MODALITIES = ['reps', 'tiempo', 'distancia'] as const;

const schema = z.object({
  name: z.string().trim().min(1, 'Requerido').max(120),
  muscle_group: z.string().trim().min(1, 'Requerido').max(60),
  equipment: z.enum(EQUIPMENT),
  movement_pattern: z.enum(PATTERNS),
  is_principal: z.boolean(),
  is_unilateral: z.boolean(),
  level_min: z.enum(LEVELS),
  contraindicated_for: z.string(), // comma-separated → parse on submit
  default_increment_kg: z.coerce.number().min(0).max(99.99),
  alternatives_ids: z.string(), // comma-separated ints → parse on submit
  video_url: z.union([z.string().url(), z.literal('')]).nullable(),
  illustration_url: z.union([z.string().url(), z.literal('')]).nullable(),
  modality: z.enum(MODALITIES),
  default_target: z.string().trim().max(60),
  rep_cycle_threshold: z.coerce.number().int().min(1).max(50),
});

type FormValues = z.infer<typeof schema>;

function exerciseToForm(e: Exercise | null): FormValues {
  if (!e) {
    return {
      name: '', muscle_group: '',
      equipment: 'barra', movement_pattern: 'isolation', level_min: 'principiante',
      is_principal: false, is_unilateral: false,
      contraindicated_for: '', default_increment_kg: 2.5,
      alternatives_ids: '', video_url: '', illustration_url: '',
      modality: 'reps', default_target: '',
      rep_cycle_threshold: 12,
    };
  }
  return {
    name: e.name, muscle_group: e.muscle_group,
    equipment: e.equipment, movement_pattern: e.movement_pattern, level_min: e.level_min,
    is_principal: e.is_principal, is_unilateral: e.is_unilateral,
    contraindicated_for: e.contraindicated_for.join(', '),
    default_increment_kg: e.default_increment_kg,
    alternatives_ids: e.alternatives_ids.join(', '),
    video_url: e.video_url ?? '',
    illustration_url: e.illustration_url ?? '',
    modality: e.modality,
    default_target: e.default_target ?? '',
    rep_cycle_threshold: e.rep_cycle_threshold,
  };
}

function formToPayload(v: FormValues): CreateExerciseInput {
  return {
    name: v.name,
    muscle_group: v.muscle_group,
    equipment: v.equipment,
    movement_pattern: v.movement_pattern,
    is_principal: v.is_principal,
    is_unilateral: v.is_unilateral,
    level_min: v.level_min,
    contraindicated_for: v.contraindicated_for
      .split(',').map((s) => s.trim()).filter(Boolean),
    default_increment_kg: Number(v.default_increment_kg),
    alternatives_ids: v.alternatives_ids
      .split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0),
    video_url: v.video_url && v.video_url !== '' ? v.video_url : null,
    illustration_url: v.illustration_url && v.illustration_url !== '' ? v.illustration_url : null,
    modality: v.modality,
    default_target: v.default_target.trim() === '' ? null : v.default_target.trim(),
    rep_cycle_threshold: Number(v.rep_cycle_threshold),
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: Exercise | null; // null = create mode
}

export function ExerciseDialog({ open, onOpenChange, exercise }: Props) {
  const isEdit = exercise !== null;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: exerciseToForm(exercise),
  });

  useEffect(() => {
    form.reset(exerciseToForm(exercise));
  }, [exercise, form]);

  const create = useCreateExercise();
  const update = useUpdateExercise(exercise?.id ?? 0);
  const archive = useArchiveExercise();
  const restore = useRestoreExercise();

  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const isArchived = exercise?.archived_at != null;

  async function onSubmit(values: FormValues) {
    const payload = formToPayload(values);
    try {
      if (isEdit && exercise) {
        await update.mutateAsync(payload);
        toast.success('Cambios guardados');
      } else {
        await create.mutateAsync(payload);
        toast.success('Ejercicio creado');
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      if (code === 'name_taken') {
        form.setError('name', { message: 'Ya existe un ejercicio con ese nombre' });
      } else {
        toast.error('No se pudo guardar');
      }
    }
  }

  async function handleArchive() {
    if (!exercise) return;
    await archive.mutateAsync(exercise.id);
    toast.success('Archivado');
    setArchiveConfirm(false);
    onOpenChange(false);
  }

  async function handleRestore() {
    if (!exercise) return;
    await restore.mutateAsync(exercise.id);
    toast.success('Restaurado');
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Editar ejercicio' : 'Nuevo ejercicio'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            {/* Column 1 */}
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="muscle_group">Grupo muscular</Label>
                <Input id="muscle_group" {...form.register('muscle_group')} />
              </div>
              <div>
                <Label>Equipo</Label>
                <Select
                  value={form.watch('equipment')}
                  onValueChange={(v) => form.setValue('equipment', v as FormValues['equipment'])}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Patrón</Label>
                <Select
                  value={form.watch('movement_pattern')}
                  onValueChange={(v) => form.setValue('movement_pattern', v as FormValues['movement_pattern'])}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PATTERNS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nivel mínimo</Label>
                <Select
                  value={form.watch('level_min')}
                  onValueChange={(v) => form.setValue('level_min', v as FormValues['level_min'])}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="inc">Incremento por defecto (kg)</Label>
                <Input id="inc" type="number" step="0.5" {...form.register('default_increment_kg')} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch('is_principal')}
                    onCheckedChange={(c) => form.setValue('is_principal', c === true)}
                  />
                  Principal
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch('is_unilateral')}
                    onCheckedChange={(c) => form.setValue('is_unilateral', c === true)}
                  />
                  Unilateral
                </label>
              </div>
            </div>

            {/* Column 2 */}
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="contra">Contraindicaciones (separadas por coma)</Label>
                <Input id="contra" {...form.register('contraindicated_for')} placeholder="lumbar, rodilla" />
              </div>
              <div>
                <Label htmlFor="alts">IDs de alternativas (separados por coma)</Label>
                <Input id="alts" {...form.register('alternatives_ids')} placeholder="12, 18, 23" />
              </div>
              <div>
                <Label>Modalidad</Label>
                <Select
                  value={form.watch('modality')}
                  onValueChange={(v) => form.setValue('modality', v as FormValues['modality'])}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODALITIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="default_target">Objetivo por defecto</Label>
                <Input id="default_target" {...form.register('default_target')} placeholder="ej. 5 min, 2 km, 10" />
              </div>
              <div>
                <Label htmlFor="rep_cycle_threshold">Tope de repes (ciclo)</Label>
                <Input
                  id="rep_cycle_threshold"
                  type="number"
                  step="1"
                  min="1"
                  max="50"
                  {...form.register('rep_cycle_threshold')}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Al llegar a estas repes sube la carga y baja a 4 (mujer) o 6 (varón).
                </p>
              </div>
              <div>
                <Label htmlFor="vid">Video URL</Label>
                <Input id="vid" type="url" {...form.register('video_url')} />
              </div>
              <div>
                <Label htmlFor="ill">Ilustración URL</Label>
                <Input id="ill" type="url" {...form.register('illustration_url')} />
                {form.watch('illustration_url') && (
                  <img
                    src={form.watch('illustration_url') ?? ''}
                    alt=""
                    className="mt-2 h-24 w-24 rounded-md border object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>
            </div>

            <DialogFooter className="md:col-span-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {isEdit && !isArchived && (
                <Button type="button" variant="outline" onClick={() => setArchiveConfirm(true)}>
                  Archivar
                </Button>
              )}
              {isEdit && isArchived && (
                <Button type="button" variant="outline" onClick={handleRestore}>
                  Restaurar
                </Button>
              )}
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {isEdit ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveConfirm} onOpenChange={setArchiveConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Archivar ejercicio</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se ocultará del catálogo. El historial queda intacto. ¿Confirmar?
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveConfirm(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleArchive}>Archivar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
