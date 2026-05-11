import { Link, useParams } from 'react-router-dom';
import { useAthlete } from '@/hooks/useAthlete';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function AthleteDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useAthlete(id!);

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-8">Cargando…</CardContent>
      </Card>
    );
  if (error || !data) {
    return (
      <Card>
        <CardContent className="space-y-4 p-8 text-center">
          <p className="text-sm text-destructive">Atleta no encontrado.</p>
          <Button asChild variant="outline">
            <Link to="/coach/athletes">Volver</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const p = data.profile as Record<string, unknown>;
  const measurements = data.measurements ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">
                {String(p.name ?? '—')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {String(p.email ?? '')}
              </p>
            </div>
            {p.plan_interest ? (
              <Badge variant="secondary" className="uppercase">
                {String(p.plan_interest)}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Teléfono" value={p.phone as string | null} />
          <Field
            label="Edad"
            value={p.age != null ? `${String(p.age)} años` : null}
          />
          <Field label="Género" value={p.gender as string | null} />
          <Field
            label="Altura"
            value={p.height_cm != null ? `${String(p.height_cm)} cm` : null}
          />
          <Field
            label="Peso"
            value={p.weight_kg != null ? `${String(p.weight_kg)} kg` : null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Perfil de entrenamiento</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Nivel" value={p.level as string | null} />
          <Field label="Objetivo" value={p.goal as string | null} />
          <Field label="Modo" value={p.training_mode as string | null} />
          <Field label="Equipamiento" value={p.equipment as string | null} />
          <Field label="Exigencia" value={p.commitment as string | null} />
          <Field
            label="Tiempo/sesión"
            value={
              p.exercise_minutes != null
                ? `${String(p.exercise_minutes)} min`
                : null
            }
          />
          <Field
            label="Días/semana"
            value={
              p.days_per_week != null
                ? `${String(p.days_per_week)} (${
                    (p.days_specific as string[] | null)?.join(', ') ?? '—'
                  })`
                : null
            }
          />
          <Field
            label="Lesiones"
            value={
              Array.isArray(p.injuries) && (p.injuries as string[]).length
                ? (p.injuries as string[]).join(', ')
                : 'ninguna'
            }
          />
          <Field label="Deporte" value={p.sport_focus as string | null} />
          <Field label="Origen" value={p.referral_source as string | null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Medidas</CardTitle>
        </CardHeader>
        <CardContent>
          {measurements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin medidas registradas
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Pecho</TableHead>
                  <TableHead>Cintura</TableHead>
                  <TableHead>Cadera</TableHead>
                  <TableHead>Muslo</TableHead>
                  <TableHead>Pantorrilla</TableHead>
                  <TableHead>Bíceps</TableHead>
                  <TableHead>Fuente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {measurements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {new Date(m.measured_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{m.chest_cm ?? '—'}</TableCell>
                    <TableCell>{m.waist_cm ?? '—'}</TableCell>
                    <TableCell>{m.hip_cm ?? '—'}</TableCell>
                    <TableCell>{m.thigh_cm ?? '—'}</TableCell>
                    <TableCell>{m.calf_cm ?? '—'}</TableCell>
                    <TableCell>{m.bicep_cm ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.source}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Button asChild variant="outline">
        <Link to="/coach/athletes">Volver a la lista</Link>
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-medium">
        {value != null && value !== '' ? value : '—'}
      </p>
    </div>
  );
}
