import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, Mail, MessageCircle, Phone, Send, UserRound, ArrowRight, ChevronRight } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';

export const PERSONAL_MANAGER = {
  name: 'Екатерина Морозова',
  role: 'Персональный менеджер ZAPUSK AI',
  telegram: '@zapusk_manager',
  email: 'manager@zapusk-ai.tech',
  phone: '+7 999 120-45-80',
  sla: 'Отвечает в течение 1 часа в рабочее время',
  lastAction: 'Проверила материалы проекта и оставила 3 правки',
  lastActionAt: 'сегодня в 11:24',
  nextStep: 'Подготовить эфир по базе инвесторов',
  nextStepDue: 'до конца недели',
};

// Sprint 14 UX-polish: на Dashboard / Project Cockpit / Demo Cabinet полная
// карточка занимала пол-экрана. compactMini = маленький блок «знай, что мы
// рядом», который ведёт на отдельную страницу /personal-manager.
export function PersonalManagerMiniCard() {
  return (
    <Card padded accent="zapusk" className="overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-grad-zapusk text-white flex items-center justify-center shadow-glow shrink-0">
          <UserRound size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold">Персональный менеджер</span>
            <StatusBadge tone="success" dot>на связи</StatusBadge>
          </div>
          <div className="text-sm font-semibold text-primary mt-0.5 truncate">{PERSONAL_MANAGER.name}</div>
          <p className="text-[11px] text-muted leading-snug mt-0.5">
            Поможет пройти этапы и закрыть вопросы.
          </p>
        </div>
        <Link to="/personal-manager" className="shrink-0">
          <Button size="sm" variant="secondary" iconRight={<ChevronRight size={13} />}>
            Открыть
          </Button>
        </Link>
      </div>
    </Card>
  );
}

export function PersonalManagerCard({ compact }: { compact?: boolean }) {
  return (
    <Card padded accent="zapusk">
      <CardHeader
        title="Персональный менеджер"
        subtitle="Помогает пройти бриф, упаковку, AI-лиды и встречи с инвесторами"
        action={<StatusBadge tone="success" dot>на связи</StatusBadge>}
      />
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-grad-zapusk text-white flex items-center justify-center shadow-glow shrink-0">
          <UserRound size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-primary">{PERSONAL_MANAGER.name}</div>
          <div className="text-xs text-muted mt-0.5">{PERSONAL_MANAGER.role}</div>

          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-secondary">
            <Clock size={12} className="text-success" />
            {PERSONAL_MANAGER.sla}
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">
                <CheckCircle2 size={11} className="text-success" />
                Последнее действие
              </div>
              <div className="text-xs text-primary leading-snug">{PERSONAL_MANAGER.lastAction}</div>
              <div className="text-[10px] text-muted mt-1">{PERSONAL_MANAGER.lastActionAt}</div>
            </div>
            <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">
                <ArrowRight size={11} className="text-zapusk-400" />
                Следующий шаг
              </div>
              <div className="text-xs text-primary leading-snug">{PERSONAL_MANAGER.nextStep}</div>
              <div className="text-[10px] text-muted mt-1">{PERSONAL_MANAGER.nextStepDue}</div>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-3'} gap-2 mt-3`}>
            <Contact icon={<MessageCircle size={13} />} label="Telegram" value={PERSONAL_MANAGER.telegram} />
            <Contact icon={<Mail size={13} />} label="Email" value={PERSONAL_MANAGER.email} />
            <Contact icon={<Phone size={13} />} label="Телефон" value={PERSONAL_MANAGER.phone} />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" iconLeft={<Send size={13} />}>Задать вопрос менеджеру</Button>
            <Button size="sm" variant="secondary" iconLeft={<MessageCircle size={13} />}>Запросить помощь по этапу</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Contact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">
        {icon}
        {label}
      </div>
      <div className="text-xs text-primary mt-1 truncate">{value}</div>
    </div>
  );
}
