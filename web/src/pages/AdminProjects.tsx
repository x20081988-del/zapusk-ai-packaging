import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';

interface AdminProject {
  id: string;
  name: string;
  industry: string | null;
  raiseAmount: number | null;
  currency: string;
  status: string;
  updatedAt: string;
  user: { email: string; name: string | null };
  _count: { files: number; generatedPrompts: number; generatedDocs: number };
}

export default function AdminProjects() {
  const [projects, setProjects] = useState<AdminProject[] | null>(null);

  useEffect(() => {
    api.get<{ projects: AdminProject[] }>('/api/admin/projects').then((r) => setProjects(r.projects));
  }, []);

  return (
    <AppLayout title="Админ · Проекты">
      <Card padded>
        <CardHeader
          title="Все проекты"
          subtitle="Список по всем фаундерам · ранний режим без ролей"
          action={<StatusBadge tone="info" dot>только просмотр</StatusBadge>}
        />
        {!projects ? (
          <p className="text-sm text-muted text-center py-8">Загрузка…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-muted">
                  <th className="py-2 pr-4">Проект</th>
                  <th className="py-2 pr-4">Фаундер</th>
                  <th className="py-2 pr-4">Отрасль</th>
                  <th className="py-2 pr-4">Запрос</th>
                  <th className="py-2 pr-4 text-right">Файлы</th>
                  <th className="py-2 pr-4 text-right">Задания</th>
                  <th className="py-2 pr-4">Статус</th>
                  <th className="py-2 pr-4">Обновлён</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-t border-hairline hover:bg-surface/40 transition-colors">
                    <td className="py-3 pr-4">
                      <Link to={`/projects/${p.id}`} className="font-medium text-primary hover:text-zapusk-400">
                        {p.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-secondary">{p.user.name ?? p.user.email}</td>
                    <td className="py-3 pr-4 text-secondary">{p.industry ?? '—'}</td>
                    <td className="py-3 pr-4 font-num">{formatMoney(p.raiseAmount, p.currency)}</td>
                    <td className="py-3 pr-4 text-right font-num">{p._count.files}</td>
                    <td className="py-3 pr-4 text-right font-num">{p._count.generatedPrompts}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={p.status === 'ready' ? 'success' : p.status === 'packaging' ? 'zapusk' : 'neutral'}>
                        {p.status}
                      </StatusBadge>
                    </td>
                    <td className="py-3 pr-4 text-muted text-xs">{formatDate(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
