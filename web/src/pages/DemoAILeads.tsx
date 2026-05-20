import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Radio, PhoneCall, MessageSquare, UserCheck, Sparkles, Flame, Wallet,
  Clock, ShieldCheck, ChevronRight, ExternalLink, Target, Headphones,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import { AudioCard, type AILeadAudio } from './AILeads';

// Sprint 26 — отдельная демо-витрина AI-лидов. Главснаб как образцовый кейс.
// Sprint 62.P1 demo hotfix — раньше страница была hardcoded JSX и кнопки
// «Прослушать запись» / «Открыть транскрипт» были декоративными. Теперь:
//   • Hero / KPI / Guarantee остаются маркетинговыми блоками.
//   • Список лидов подтягивается с /api/ai-leads/showcase (всегда демо-набор,
//     11 синтетических лидов без PII — Sprint 35 P1 их санитизировал).
//   • Каждая запись отрисовывается через тот же AudioCard, что и в /ai-leads,
//     с честным «недоступно на этом инстансе», если .wav файлов нет.
//   • При клике на лид показывается AudioCard с inline <audio controls>,
//     плюс summary разговора и следующий шаг.

interface ShowcaseLead {
  id: string;
  status: 'HOT' | 'NEW' | 'WAITING' | 'CONTACTED';
  receivedAt: string;
  title: string;
  investor: {
    name: string;
    phone: string;
    checkRange: string;
    decisionWindow: string;
    profile: string;
  };
  tags?: string[];
  aiSummary: string;
  whatHappened: {
    summary: string;
    interest: string;
    objections: string[];
    sent: string[];
    nextStep: string;
  };
  audio: AILeadAudio;
}

interface ShowcaseDashboard {
  leads: ShowcaseLead[];
  kpis: {
    totalLeads: number;
    activeToday: number;
    avgCheck: string;
    callsToday: number;
    messagesSent: number;
  };
}

export default function DemoAILeads() {
  const [data, setData] = useState<ShowcaseDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<ShowcaseDashboard>('/api/ai-leads/showcase')
      .then((res) => {
        if (!alive) return;
        setData(res);
        // auto-expand первый HOT lead
        const firstHot = res.leads.find((l) => l.status === 'HOT');
        setSelectedId(firstHot?.id ?? res.leads[0]?.id ?? null);
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'unknown');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const leads = data?.leads ?? [];
  const selected = leads.find((l) => l.id === selectedId) ?? leads[0] ?? null;

  return (
    <AppLayout
      title="Демо AI-лиды · Главснаб"
      action={
        <Link to="/ai-leads">
          <Button variant="primary" size="md" iconRight={<ChevronRight size={14} />}>
            Запустить у себя
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Hero — маркетинговый блок, не data-driven */}
        <Card padded accent="ai" className="overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(35,214,176,0.14),transparent_30%)]" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-grad-ai/15 border border-ai/30 text-ai-glow flex items-center justify-center shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-ai-glow font-semibold mb-1">
                Демо-витрина · Главснаб
              </div>
              <h2 className="text-base font-semibold text-primary">
                Так работает AI-лидогенерация ZAPUSK после запуска проекта
              </h2>
              <p className="text-xs text-secondary mt-1 leading-relaxed max-w-3xl">
                Это показательный кейс. После запуска вашего проекта на этой странице будут
                ваши лиды — AI звонит инвесторам, ведёт переписки, квалифицирует интерес и
                передаёт горячие контакты вам и менеджеру.
              </p>
            </div>
          </div>
        </Card>

        {/* KPI grid — из реальных showcase-данных */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <KpiCard
            icon={<Radio size={16} />}
            label="Активные лиды"
            value={loading ? '…' : String(data?.kpis.totalLeads ?? 0)}
            tone="ai"
          />
          <KpiCard
            icon={<PhoneCall size={16} />}
            label="Звонков за сутки"
            value={loading ? '…' : String(data?.kpis.callsToday ?? 0)}
            tone="zapusk"
          />
          <KpiCard
            icon={<MessageSquare size={16} />}
            label="Сообщений отправлено"
            value={loading ? '…' : String(data?.kpis.messagesSent ?? 0)}
            tone="zapusk"
          />
          <KpiCard
            icon={<UserCheck size={16} />}
            label="Квалифицированных"
            value={loading ? '…' : String(data?.kpis.activeToday ?? 0)}
            tone="ai"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          {/* Main column — реальный список лидов + детали выбранного */}
          <div className="space-y-4">
            {/* Список лидов */}
            <Card padded>
              <CardHeader
                title="Демо-лиды"
                subtitle={`${leads.length} разговоров · кликните для деталей и записи`}
              />
              {loading && (
                <div className="text-sm text-muted py-8 text-center">Загрузка демо-данных…</div>
              )}
              {error && !loading && (
                <EmptyState
                  icon={<Headphones size={20} />}
                  title="Не удалось загрузить showcase"
                  description={`Ошибка: ${error}. Проверьте, что endpoint /api/ai-leads/showcase отвечает.`}
                />
              )}
              {!loading && !error && leads.length === 0 && (
                <EmptyState
                  icon={<Headphones size={20} />}
                  title="Showcase пуст"
                  description="Серверный seed mockLeads() ничего не вернул. Проверьте aiLeadsService."
                />
              )}
              {!loading && !error && leads.length > 0 && (
                <ul className="space-y-2">
                  {leads.map((lead) => (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(lead.id)}
                        className={`w-full text-left rounded-md border px-3 py-2.5 transition-all ${
                          selectedId === lead.id
                            ? 'border-ai/45 bg-ai/10 shadow-ai-glow'
                            : 'border-hairline bg-canvas/40 hover:border-ai/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge tone={lead.status === 'HOT' ? 'danger' : lead.status === 'NEW' ? 'ai' : 'neutral'} dot>
                            {lead.status}
                          </StatusBadge>
                          <span className="text-sm font-semibold text-primary truncate">{lead.investor.name}</span>
                          <span className="text-[11px] text-muted ml-auto shrink-0">{relTime(lead.receivedAt)}</span>
                        </div>
                        <p className="text-xs text-secondary leading-snug line-clamp-2">{lead.aiSummary}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Детали выбранного — здесь и проигрывается аудио */}
            {selected && (
              <Card padded>
                <CardHeader
                  title={`Разговор · ${selected.investor.name}`}
                  subtitle="Запись AI-звонка и контекст разговора"
                  action={
                    <StatusBadge tone={selected.status === 'HOT' ? 'danger' : 'neutral'} dot>
                      {selected.status}
                    </StatusBadge>
                  }
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <LeadFact icon={<Wallet size={13} />} label="Чек" value={selected.investor.checkRange} />
                  <LeadFact icon={<Clock size={13} />} label="Срок решения" value={selected.investor.decisionWindow} />
                  <LeadFact icon={<Target size={13} />} label="Профиль" value={selected.investor.profile} />
                </div>
                {/* Sprint 62.P1 hotfix — здесь и происходит inline-проигрывание */}
                <AudioCard audio={selected.audio} />
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <Block label="Что произошло" body={selected.whatHappened.summary} />
                  <Block label="Следующий шаг" body={selected.whatHappened.nextStep} />
                </div>
                {selected.whatHappened.objections.length > 0 && (
                  <div className="mt-3 rounded-md border border-warning/25 bg-warning/8 px-3 py-2 text-xs text-warning">
                    Возражение: {selected.whatHappened.objections.join(' ')}
                  </div>
                )}
                {selected.whatHappened.sent.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mr-1">Отправлено:</span>
                    {selected.whatHappened.sent.map((s) => (
                      <StatusBadge key={s} tone="neutral">{s}</StatusBadge>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Sidebar — маркетинговая часть, не data-driven */}
          <aside className="space-y-4">
            <Card padded accent="ai">
              <CardHeader title="AI работает сейчас" subtitle="Демо-режим: поток лидов в реальном времени" />
              <div className="space-y-3">
                <LiveStatus icon={<PhoneCall size={14} />} label="AI-прозвон базы" value={`${data?.kpis.callsToday ?? 0} звонков сегодня`} active />
                <LiveStatus icon={<MessageSquare size={14} />} label="Мессенджеры" value={`${data?.kpis.messagesSent ?? 0} сообщений`} active />
                <LiveStatus icon={<UserCheck size={14} />} label="Квалификация" value={`${data?.kpis.activeToday ?? 0} активных лидов`} active />
                <LiveStatus icon={<Flame size={14} />} label="Горячие лиды" value={`${leads.filter((l) => l.status === 'HOT').length} ждут ответа`} active />
              </div>
            </Card>

            <Card padded accent="zapusk">
              <CardHeader title="Гарантия замены" subtitle="Не релевантный лид — не считается" />
              <div className="space-y-2 text-xs text-secondary">
                <GuaranteeLine text="Меняем лид, если инвестор оказался не профильным." />
                <GuaranteeLine text="3 попытки контакта на каждого инвестора." />
                <GuaranteeLine text="Каждый разговор сохраняется и доступен в кабинете." />
              </div>
            </Card>

            <Card padded>
              <CardHeader title="Готовы запустить?" subtitle="После активации откроется ваш поток лидов" />
              <Link to="/ai-leads" className="block">
                <Button className="w-full" variant="primary" iconRight={<ExternalLink size={14} />}>
                  Перейти в AI-лиды
                </Button>
              </Link>
            </Card>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  try {
    const diffMin = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} ч назад`;
    return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  } catch {
    return iso;
  }
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'ai' | 'zapusk' }) {
  return (
    <Card accent={tone}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">{label}</div>
          <div className="text-2xl font-bold text-primary font-num mt-1">{value}</div>
        </div>
        <div className={`w-9 h-9 rounded-md flex items-center justify-center ${tone === 'ai' ? 'bg-ai/15 text-ai-glow border border-ai/30' : 'bg-zapusk/15 text-zapusk-400 border border-zapusk/30'}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function LeadFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold text-primary mt-1">{value}</div>
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">{label}</div>
      <div className="text-xs text-primary leading-snug">{body}</div>
    </div>
  );
}

function LiveStatus({ icon, label, value, active }: { icon: React.ReactNode; label: string; value: string; active?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`w-2 h-2 rounded-full mt-1.5 ${active ? 'bg-ai animate-pulse' : 'bg-muted'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">
          {icon}
          {label}
        </div>
        <div className="text-xs text-primary mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function GuaranteeLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <ShieldCheck size={12} className="text-zapusk-400 mt-0.5 shrink-0" />
      {text}
    </div>
  );
}
