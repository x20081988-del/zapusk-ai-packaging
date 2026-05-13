import { ExternalLink, FileText, Headphones, Phone, Radio, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ProjectJourney } from '../components/ui/ProjectJourney';
import { ProjectMaterialCard } from '../components/ui/ProjectMaterialCard';
import { PersonalManagerCard } from '../components/ui/PersonalManagerCard';
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
                Идеальный demo cabinet: заполненный бриф, готовая маркетинговая упаковка, презентация,
                финансовая модель, посадочная страница, AI-лиды, запись разговора и следующий юридический этап.
              </p>
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
            <Card padded>
              <CardHeader
                title="AI-лиды Главснаб"
                subtitle="Реальный демо-лид с контекстом общения и записью"
                action={<StatusBadge tone="danger" dot>HOT</StatusBadge>}
              />
              <div className="rounded-lg border border-ai/25 bg-ai/8 p-4">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-primary">Новый квалифицированный лид</h3>
                    <p className="text-sm text-secondary mt-1">Инвестор запросила пакет документов, ссылки и ждёт звонка от специалиста.</p>
                  </div>
                  <StatusBadge tone="success">готов к взаимодействию</StatusBadge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                  <LeadMeta label="Имя" value="Без имени" />
                  <LeadMeta label="Телефон" value="+7 951 981-11-19" />
                  <LeadMeta label="Сумма" value="от 1 млн ₽" />
                  <LeadMeta label="Срок" value="1 месяц" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 mt-4">
                  <div className="rounded-md border border-hairline bg-surface p-4">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-2">Что произошло</div>
                    <ul className="space-y-2 text-sm text-secondary">
                      <li>Предложение заинтересовало.</li>
                      <li>Комфортная сумма для инвестиций: от 1 млн рублей.</li>
                      <li>Ориентир по сроку инвестиций: 1 месяц.</li>
                      <li>Следующий шаг: звонок специалиста и отправка документов.</li>
                    </ul>
                  </div>
                  <a
                    href="https://aicallscloud.ru/api/process-record-url?recordUrl=0ed73e45-ab1e-4a1d-ae4c-435d49bd6f77.wav"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-ai/25 bg-ai/10 p-4 hover:border-ai/45 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-grad-ai text-canvas flex items-center justify-center shadow-ai-glow mb-3">
                      <Headphones size={16} />
                    </div>
                    <div className="text-sm font-semibold text-primary">Запись AI-разговора</div>
                    <div className="text-xs text-muted mt-1">Открыть запись общения оператора</div>
                  </a>
                </div>
              </div>
            </Card>

            <ProjectJourney stages={DEFAULT_PROJECT_JOURNEY} />
          </div>
          <aside className="space-y-4">
            <PersonalManagerCard compact />
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

function LeadMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">{label}</div>
      <div className="text-sm text-primary mt-1">{value}</div>
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
