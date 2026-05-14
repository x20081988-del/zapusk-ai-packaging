import { Link } from 'react-router-dom';
import {
  Radio, PhoneCall, MessageSquare, UserCheck, Sparkles, Flame, Clock, Wallet,
  Headphones, ShieldCheck, ChevronRight, Play, MessageCircle, Target, ExternalLink,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';

// Sprint 26 — отдельная демо-витрина AI-лидов. Главснаб как образцовый кейс.
// Чёткое позиционирование: это пример, не ваши лиды. Не вызываем /api/ai-leads,
// рендерим хардкодом showcase-данные. Ссылка «Запустить у себя» ведёт в
// продакшен-флоу /ai-leads.
export default function DemoAILeads() {
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <KpiCard icon={<Radio size={16} />} label="Активные лиды" value="12" tone="ai" />
          <KpiCard icon={<PhoneCall size={16} />} label="Звонков за сутки" value="43" tone="zapusk" />
          <KpiCard icon={<MessageSquare size={16} />} label="Сообщений отправлено" value="128" tone="zapusk" />
          <KpiCard icon={<UserCheck size={16} />} label="Квалифицированных" value="7" tone="ai" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-4">
            <Card padded>
              <CardHeader title="Горячий лид · Главснаб" subtitle="Состояние, как у работающего проекта" action={<StatusBadge tone="danger" dot>HOT</StatusBadge>} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <LeadFact icon={<Wallet size={13} />} label="Чек" value="от 1 млн ₽" />
                <LeadFact icon={<Clock size={13} />} label="Решение" value="1 месяц" />
                <LeadFact icon={<Target size={13} />} label="Профиль" value="Private investor" />
              </div>
              <div className="rounded-md border border-ai/25 bg-ai/8 p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-grad-ai text-canvas flex items-center justify-center shadow-ai-glow shrink-0">
                  <Headphones size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-primary">AI-звонок · 7 минут</div>
                  <p className="text-xs text-secondary mt-1 leading-relaxed">
                    Инвестор подтвердил интерес. Запрашивает финансовую модель и one-pager.
                    Возражения по горизонту окупаемости сняты примерами других проектов.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="ai" iconLeft={<Play size={12} />}>Прослушать запись</Button>
                    <Button size="sm" variant="secondary" iconLeft={<MessageCircle size={12} />}>Открыть транскрипт</Button>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <Block label="Что произошло" body="AI-агент представил Главснаб, обсудил доходность и горизонт. Инвестор сравнил с похожим кейсом в нише и сам предложил следующий шаг." />
                <Block label="Следующий шаг" body="Менеджер высылает финмодель + one-pager. Назначен звонок-знакомство с фаундером через 2 дня." />
              </div>
            </Card>

            <Card padded>
              <CardHeader title="Поток коммуникаций" subtitle="AI ведёт несколько каналов одновременно" />
              <div className="space-y-2">
                <Channel channel="AI-звонок" tone="ai" status="Закрыт"   summary="Инвестор согласился получить материалы. Чек до 2 млн ₽." />
                <Channel channel="Telegram" tone="zapusk" status="Ответили"   summary="Инвестор задал вопрос про юридическую структуру сделки." />
                <Channel channel="WhatsApp" tone="ai" status="Доставлено"   summary="AI отправил тизер и финансовую модель." />
                <Channel channel="Follow-up" tone="zapusk" status="Назначен" summary="Через 2 дня — звонок-знакомство с фаундером." />
              </div>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card padded accent="ai">
              <CardHeader title="AI работает сейчас" subtitle="Демо-режим live pipeline" />
              <div className="space-y-3">
                <LiveStatus icon={<PhoneCall size={14} />} label="AI-прозвон базы" value="43 звонка сегодня" active />
                <LiveStatus icon={<MessageSquare size={14} />} label="Мессенджеры" value="128 сообщений" active />
                <LiveStatus icon={<UserCheck size={14} />} label="Квалификация" value="7 активных лидов" active />
                <LiveStatus icon={<Flame size={14} />} label="Горячие лиды" value="1 ждёт ответа" active />
              </div>
            </Card>

            <Card padded accent="zapusk">
              <CardHeader title="Гарантия замены" subtitle="Не релевантный лид — не считается" />
              <div className="space-y-2 text-xs text-secondary">
                <div className="flex items-start gap-2">
                  <ShieldCheck size={12} className="text-zapusk-400 mt-0.5 shrink-0" />
                  Меняем лид, если инвестор оказался не профильным.
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck size={12} className="text-zapusk-400 mt-0.5 shrink-0" />
                  3 попытки контакта на каждого инвестора.
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck size={12} className="text-zapusk-400 mt-0.5 shrink-0" />
                  Каждый разговор сохраняется и доступен в кабинете.
                </div>
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

function Channel({ channel, tone, status, summary }: { channel: string; tone: 'ai' | 'zapusk'; status: string; summary: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-md border ${tone === 'ai' ? 'border-ai/25 bg-ai/6' : 'border-zapusk/25 bg-zapusk/6'} px-3 py-2.5`}>
      <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${tone === 'ai' ? 'text-ai-glow' : 'text-zapusk-400'} shrink-0`}>{channel}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-primary font-medium">{status}</div>
        <div className="text-[11px] text-secondary leading-snug mt-0.5">{summary}</div>
      </div>
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
