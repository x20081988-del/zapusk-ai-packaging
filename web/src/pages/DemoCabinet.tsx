import { Link } from 'react-router-dom';
import {
  ChevronRight, ExternalLink, FileText, Headphones, Phone, Radio, ShieldCheck, TrendingUp, Wallet,
  MessageSquare, PhoneCall,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ProjectJourney } from '../components/ui/ProjectJourney';
import { ProjectMaterialCard } from '../components/ui/ProjectMaterialCard';
import { PersonalManagerMiniCard } from '../components/ui/PersonalManagerCard';
import { DEFAULT_PROJECT_JOURNEY } from '../lib/projectJourney';
import { getDemoMaterials, getDemoTransformationCase } from '../lib/demoMaterials';

const demoProject = { name: 'Главснаб' };
const demoMaterials = getDemoMaterials(demoProject);
const transformation = getDemoTransformationCase(demoProject);

export default function DemoCabinet() {
  return (
    <AppLayout title="Демо-кабинет · Главснаб">
      <div className="space-y-6">
        <Card padded className="overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,90,31,0.13),transparent_30%),radial-gradient(circle_at_82%_0%,rgba(124,92,255,0.12),transparent_26%)]" />
          <div className="relative grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <StatusBadge tone="success" dot>готов к привлечению инвестиций</StatusBadge>
                <StatusBadge tone="ai" dot>AI-лиды активны</StatusBadge>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-primary tracking-tight">Главснаб</h1>
              <p className="text-sm text-secondary mt-3 max-w-3xl leading-relaxed">
                Идеальный демо-кабинет: заполненный бриф, AI-готовая упаковка с семантической
                структурой для AI-поиска, готовая презентация, финансовая модель, посадочная страница,
                AI-лиды, запись разговора и следующий юридический этап.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <StatusBadge tone="ai" dot>Готово к AI-поиску</StatusBadge>
                <StatusBadge tone="success" dot>Структура для AI-поиска</StatusBadge>
                <StatusBadge tone="zapusk" dot>Виден AI-поиску</StatusBadge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                <Metric icon={<Wallet size={14} />} label="Чек инвестора" value="от 1 млн ₽" />
                <Metric icon={<TrendingUp size={14} />} label="Готовность" value="92%" />
                <Metric icon={<Radio size={14} />} label="AI-лиды" value="12" />
                <Metric icon={<ShieldCheck size={14} />} label="Этап" value="сделка" />
              </div>
              <div className="flex flex-wrap gap-2 mt-5">
                <a href="https://glavsnab.zapusk.tech/" target="_blank" rel="noreferrer">
                  <Button iconLeft={<ExternalLink size={14} />}>Открыть сайт</Button>
                </a>
                <a href="/demo-assets/glavsnab-after-pitch.pdf" target="_blank" rel="noreferrer">
                  <Button variant="secondary" iconLeft={<FileText size={14} />}>Презентация</Button>
                </a>
              </div>
            </div>
            <Card padded accent="ai">
              <CardHeader title="AI работает по проекту" subtitle="Демо-состояние продающего кабинета" />
              <div className="space-y-2">
                <Pipeline label="Бриф заполнен" done />
                <Pipeline label="Материалы готовы" done />
                <Pipeline label="AI-лиды поступают" done />
                <Pipeline label="Юридическая упаковка" />
                <Pipeline label="Сделочная механика" />
              </div>
            </Card>
          </div>
        </Card>

        {transformation && (
          <Card padded>
            <CardHeader title="Трансформация упаковки" subtitle={transformation.summary} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <MaterialColumn title={transformation.beforeLabel} tone="neutral" materials={transformation.before} />
              <MaterialColumn title={transformation.afterLabel} tone="ai" materials={transformation.after} />
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            {/* Sprint 14: Demo Cabinet раньше дублировал всю AI-leads-карточку
                одного лида (телефон, разговор, чек, что произошло). Это
                перегружало демо. Теперь — компактный preview + CTA в /ai-leads,
                где живёт полный интерфейс и больше примеров. */}
            <Card padded accent="ai">
              <CardHeader
                title="AI-лиды Главснаб"
                subtitle="В демо-кабинете показываем превью. Полный feed, записи разговоров и контекст — на странице AI-лидов."
                action={<StatusBadge tone="danger" dot>HOT</StatusBadge>}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <PreviewStat icon={<Radio size={14} />} label="Активные лиды" value="12" tone="ai" />
                <PreviewStat icon={<PhoneCall size={14} />} label="Звонков за сутки" value="43" tone="zapusk" />
                <PreviewStat icon={<MessageSquare size={14} />} label="Сообщений отправлено" value="128" tone="zapusk" />
              </div>
              <div className="rounded-md border border-ai/25 bg-ai/8 p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-grad-ai text-canvas flex items-center justify-center shadow-ai-glow shrink-0">
                  <Headphones size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-primary">Новый квалифицированный лид · от 1 млн ₽ · 1 месяц</div>
                  <p className="text-xs text-secondary mt-1 leading-relaxed">
                    В разделе AI-лиды можно посмотреть больше примеров, прослушать записи звонков и
                    увидеть контекст коммуникации с каждым инвестором.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Link to="/ai-leads">
                  <Button variant="ai" iconRight={<ChevronRight size={14} />}>Открыть AI-лиды</Button>
                </Link>
              </div>
            </Card>

            <ProjectJourney stages={DEFAULT_PROJECT_JOURNEY} />
          </div>
          <aside className="space-y-4">
            <PersonalManagerMiniCard />
            <Card padded accent="zapusk">
              <CardHeader title="Сделочная механика" subtitle="MVP-статус юридического этапа" />
              <div className="space-y-2 text-sm text-secondary">
                <DealLine label="Юридическая упаковка" value="в работе" />
                <DealLine label="Механика" value="доля / конвертируемый займ" />
                <DealLine label="Следующий шаг" value="согласовать структуру с инвестором" />
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function MaterialColumn({ title, materials }: { title: string; tone: 'neutral' | 'ai'; materials: typeof demoMaterials }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-3">{title}</div>
      <div className="grid grid-cols-1 gap-3">
        {materials.map((material) => <ProjectMaterialCard key={material.id} material={material} />)}
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/55 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">{icon}{label}</div>
      <div className="text-sm font-semibold text-primary mt-1">{value}</div>
    </div>
  );
}

function Pipeline({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-2 h-2 rounded-full ${done ? 'bg-success' : 'bg-ai animate-pulse'}`} />
      <span className={done ? 'text-primary' : 'text-secondary'}>{label}</span>
    </div>
  );
}

function PreviewStat({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: 'ai' | 'zapusk' }) {
  return (
    <div className={`rounded-md border ${tone === 'ai' ? 'border-ai/25 bg-ai/8' : 'border-zapusk/25 bg-zapusk/8'} px-3 py-3`}>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-semibold ${tone === 'ai' ? 'text-ai-glow' : 'text-zapusk-400'}`}>
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold text-primary font-num mt-1">{value}</div>
    </div>
  );
}

function DealLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-hairline bg-canvas/45 px-3 py-2">
      <Phone size={13} className="text-zapusk-400 mt-0.5 shrink-0" />
      <div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">{label}</div>
        <div className="text-xs text-primary mt-0.5">{value}</div>
      </div>
    </div>
  );
}
