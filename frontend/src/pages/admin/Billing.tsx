import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/admin/PageHeader';
import { useBillingInfo, useUpdateBilling, type BillingInfo } from '@/hooks/useBilling';

export default function Billing() {
  const { data, isLoading } = useBillingInfo();
  const update = useUpdateBilling();
  const [form, setForm] = useState<BillingInfo>({
    alias: '',
    cbu: '',
    holder: '',
    amount: 0,
    currency: 'ARS',
    note: '',
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  function set<K extends keyof BillingInfo>(k: K, v: BillingInfo[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    try {
      await update.mutateAsync({
        alias: form.alias,
        cbu: form.cbu,
        holder: form.holder,
        amount: form.amount == null ? null : Number(form.amount),
        currency: form.currency,
        note: form.note,
      });
      toast.success('Datos de pago guardados');
    } catch {
      toast.error('No se pudo guardar');
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Cargando...</div>;

  return (
    <div className="max-w-lg space-y-4">
      <PageHeader
        eyebrow="Cobros"
        title="Datos de pago"
        sub="Lo que ven los atletas para transferir la cuota"
      />
      <label className="block text-sm">
        Alias
        <Input
          value={form.alias ?? ''}
          onChange={(e) => set('alias', e.target.value)}
        />
      </label>
      <label className="block text-sm">
        CBU
        <Input
          value={form.cbu ?? ''}
          onChange={(e) => set('cbu', e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Titular
        <Input
          value={form.holder ?? ''}
          onChange={(e) => set('holder', e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Monto
        <Input
          type="number"
          value={form.amount ?? 0}
          onChange={(e) => set('amount', Number(e.target.value))}
        />
      </label>
      <label className="block text-sm">
        Nota
        <Input
          value={form.note ?? ''}
          onChange={(e) => set('note', e.target.value)}
        />
      </label>
      <Button onClick={save} disabled={update.isPending}>
        Guardar
      </Button>
    </div>
  );
}
