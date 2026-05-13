import { useEffect, useMemo, useState } from 'react';
import { Headphones, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { MeetingCard } from '../components/ui/MeetingCard';
import { listMeetings, type SalesSession } from '../lib/salesSessions';
import { api, type Project } from '../lib/api';

export default function Meetings() {
  const [sessions, setSessions] = useState<SalesSession[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState('');

  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects));
  }, []);

  useEffect(() => {
    listMeetings(projectFilter ? { projectId: projectFilter } : {}).then((r) => setSessions(r.sessions));
  }, [projectFilter]);

  const filtered = useMemo(() => sessions ?? [], [sessions]);

  return (
    <AppLayout
      title="Встречи с инвесторами"
      action={
        <Link to="/sales-assistant">
          <Button size="md" iconLeft={<Headphones size={14} />}>Провести встречу</Button>
        </Link>
      }
    >
      <Card padded className="mb-6">
        <CardHeader
          title="Память встреч"
          subtitle="Каждая завершённая встреча превращается в карточку сделки с next step и готовым follow-up"
          action={
            <div className="w-72">
              <Select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                options={[{ value: '', label: 'Все проекты' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
          }
        />
      </Card>

      {sessions === null ? (
        <Card><div className="text-sm text-muted text-center py-8">Загрузка…</div></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sparkles size={20} />}
            title="Встреч пока нет"
            description="Запустите AI-ассистента, проведите встречу и нажмите «Завершить встречу» — она появится здесь как карточка сделки с готовым follow-up."
            action={
              <Link to="/sales-assistant">
                <Button iconLeft={<Headphones size={14} />}>Провести первую встречу</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => <MeetingCard key={s.id} session={s} />)}
        </div>
      )}
    </AppLayout>
  );
}
