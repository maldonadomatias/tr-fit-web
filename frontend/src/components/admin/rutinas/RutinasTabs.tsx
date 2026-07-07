import { useLocation, useNavigate } from 'react-router-dom';
import { Segmented } from '@/components/admin/Segmented';

type TabKey = 'cola' | 'activas';

export function RutinasTabs() {
  const loc = useLocation();
  const navigate = useNavigate();
  const isActivas = loc.pathname.startsWith('/admin/rutinas/atleta');
  const value: TabKey = isActivas ? 'activas' : 'cola';

  return (
    <div className="border-b border-border bg-card px-4 py-3 lg:px-7">
      <Segmented<TabKey>
        value={value}
        onChange={(k) =>
          navigate(k === 'cola' ? '/admin/rutinas' : '/admin/rutinas/atleta')
        }
        options={[
          { key: 'cola', label: 'Cola pendiente' },
          { key: 'activas', label: 'Activas' },
        ]}
      />
    </div>
  );
}
