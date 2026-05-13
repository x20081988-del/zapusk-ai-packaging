import { Mail, MessageCircle, Phone, Send, UserRound } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';

export const PERSONAL_MANAGER = {
  name: 'Екатерина Морозова',
  role: 'Персональный менеджер ZAPUSK AI',
  telegram: '@zapusk_manager',
  email: 'manager@zapusk-ai.tech',
  phone: '+7 999 120-45-80',
};

export function PersonalManagerCard({ compact }: { compact?: boolean }) {
  return (
    <Card padded accent="zapusk">
      <CardHeader
        title="Персональный менеджер"
        subtitle="Помогает пройти бриф, упаковку, AI-лиды и встречи с инвесторами"
        action={<StatusBadge tone="success" dot>на связи</StatusBadge>}
      />
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-grad-zapusk text-canvas flex items-center justify-center shadow-glow shrink-0">
          <UserRound size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-primary">{PERSONAL_MANAGER.name}</div>
          <div className="text-xs text-muted mt-0.5">{PERSONAL_MANAGER.role}</div>
          <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-3'} gap-2 mt-4`}>
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
