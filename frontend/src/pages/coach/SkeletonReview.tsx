import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useSkeleton,
  useApproveSkeleton,
  useRejectSkeleton,
} from '@/hooks/useSkeleton';
import { SkeletonReviewTable } from '@/components/SkeletonReviewTable';
import { AxiosError } from 'axios';

export default function SkeletonReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useSkeleton(id);
  const approve = useApproveSkeleton();
  const reject = useRejectSkeleton();
  const [feedback, setFeedback] = useState('');
  const [confirmReject, setConfirmReject] = useState(false);

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando...</div>;
  if (error || !data)
    return <div className="text-sm text-destructive">Error cargando skeleton</div>;

  async function onApprove() {
    if (!id) return;
    try {
      await approve.mutateAsync(id);
      toast.success('Skeleton aprobado');
      navigate('/coach/skeletons');
    } catch (e) {
      const err = e as AxiosError<{ error?: string }>;
      if (err.response?.status === 409) {
        toast.info('Ya estaba aprobado, refrescando...');
      } else {
        toast.error('No se pudo aprobar');
      }
    }
  }

  async function onReject() {
    if (!id) return;
    if (feedback.trim().length < 5) {
      toast.error('Feedback requiere mínimo 5 caracteres');
      return;
    }
    setConfirmReject(false);
    try {
      await reject.mutateAsync({ id, feedback: feedback.trim() });
      toast.success('Skeleton rechazado, generando uno nuevo');
      navigate('/coach/skeletons');
    } catch {
      toast.error('No se pudo rechazar');
    }
  }

  const { profile, skeleton, slots } = data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{profile.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Nivel</div>
            <div className="font-medium capitalize">{profile.level}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Objetivo</div>
            <div className="font-medium capitalize">{profile.goal}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Días/semana</div>
            <div className="font-medium">{profile.days_per_week}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Equipo</div>
            <div className="font-medium capitalize">{profile.equipment.replace('_', ' ')}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Lesiones</div>
            <div className="font-medium">
              {profile.injuries.length > 0
                ? profile.injuries.join(', ')
                : 'Ninguna reportada'}
            </div>
          </div>
        </CardContent>
      </Card>

      {skeleton.generation_rationale && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">
              Rationale de la IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{skeleton.generation_rationale}</p>
          </CardContent>
        </Card>
      )}

      <SkeletonReviewTable slots={slots} />

      <Card>
        <CardHeader>
          <CardTitle>Feedback (requerido si rechazás)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Ej: cambiá los ejercicios de hombro por algo sin sentadilla profunda..."
            rows={4}
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="destructive"
              disabled={reject.isPending}
              onClick={() => setConfirmReject(true)}
            >
              Rechazar
            </Button>
            <Button onClick={onApprove} disabled={approve.isPending}>
              Aprobar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmReject} onOpenChange={setConfirmReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Rechazar este skeleton?</DialogTitle>
            <DialogDescription>
              La IA generará uno nuevo usando tu feedback. El atleta seguirá viendo el
              actual hasta que aprobés el nuevo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReject(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onReject}>
              Sí, rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
