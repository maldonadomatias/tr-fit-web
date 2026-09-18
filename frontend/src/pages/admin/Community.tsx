import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/admin/PageHeader';
import { AdminTabs } from '@/components/admin/AdminTabs';
import { PublishTab } from '@/components/admin/community/PublishTab';
import { WallTab } from '@/components/admin/community/WallTab';
import { ReportsTab } from '@/components/admin/community/ReportsTab';
import { AdsTab } from '@/components/admin/community/AdsTab';
import {
  useCommunityReportCount,
  useCommunitySummary,
} from '@/hooks/useCommunity';

type TabKey = 'publish' | 'wall' | 'reports' | 'ads';
const TABS: TabKey[] = ['publish', 'wall', 'reports', 'ads'];

export default function Community() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as TabKey | null;
  const tab: TabKey = raw && TABS.includes(raw) ? raw : 'publish';
  const { data: openCount } = useCommunityReportCount();
  const { data: summary } = useCommunitySummary();

  return (
    <div>
      <PageHeader
        eyebrow="Comunidad"
        title="Comunidad"
        sub={
          summary && !summary.enabled
            ? 'El módulo todavía no está lanzado: los alumnos no ven el muro. Podés cargar avisos y publicidad.'
            : 'Muro de la comunidad, denuncias y publicidad.'
        }
      />
      <AdminTabs<TabKey>
        tabs={[
          { key: 'publish', label: 'Publicar' },
          { key: 'wall', label: 'Muro' },
          {
            key: 'reports',
            label: 'Denuncias',
            count: openCount ? openCount : undefined,
          },
          { key: 'ads', label: 'Publicidad' },
        ]}
        value={tab}
        onChange={(k) => setParams({ tab: k })}
      />
      {tab === 'publish' && <PublishTab />}
      {tab === 'wall' && <WallTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'ads' && <AdsTab />}
    </div>
  );
}
