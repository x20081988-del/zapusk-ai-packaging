import { useState } from 'react';
import { Copy, Check, ArrowRight, Sparkles, UserRound, Wallet, Calendar } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { type SalesSession, TONE_LABEL, TONE_BADGE, INVESTOR_TYPE_LABEL, parseJsonArray } from '../../lib/salesSessions';
import { formatDate } from '../../lib/format';

export function MeetingCard({ session, compact }: { session: SalesSession; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const objections = parseJsonArray(session.objections);
  const materials = parseJsonArray(session.materialsToSend);
  const tone = session.tone ?? 'cold';

  async function copyFollowUp() {
    if (!session.followUpMessage) return;
    await navigator.clipboard.writeText(session.followUpMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Card padded accent={tone === 'hot' ? 'zapusk' : 'ai'}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <StatusBadge tone={TONE_BADGE[tone]} dot>{TONE_LABEL[tone]}</StatusBadge>
            {session.investorType && session.investorType !== 'unknown' && (
              <span className="inline-flex items-center h-5 px-2 rounded-full bg-ai/8 border border-ai/25 text-[10px] uppercase tracking-[0.08em] text-ai-glow font-semibold">
                {INVESTOR_TYPE_LABEL[session.investorType]}
              </span>
            )}
            <span className="text-[11px] text-muted">{formatDate(session.createdAt)}</span>
          </div>
          <h3 className="text-base font-semibold text-primary tracking-tight">
            {session.investorName ?? 'Инвестор без имени'}
            {session.project && (
              <span className="text-muted font-normal ml-2 text-sm">· {session.project.name}</span>
            )}
          </h3>
        </div>
        {session.probabilityScore != null && (
          <div className="text-right shrink-0">
            <div className={`text-2xl font-bold font-num ${session.probabilityScore >= 60 ? 'text-success' : session.probabilityScore >= 35 ? 'text-zapusk-400' : 'text-warning'}`}>
              {session.probabilityScore}%
            </div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted">вероятность</div>
          </div>
        )}
      </div>

      {/* Quick facts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        <QuickFact icon={<UserRound size={12} />} label="Интерес" value={session.investorInterest ?? '—'} />
        <QuickFact icon={<Wallet size={12} />} label="Чек" value={session.checkRange ?? 'не назвал'} />
        <QuickFact icon={<Calendar size={12} />} label="Следующий шаг" value={session.nextStep ?? '—'} />
      </div>

      {!compact && session.summary && (
        <div className="rounded-md border border-hairline bg-canvas/40 p-3 mb-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1.5">
            <Sparkles size={11} className="text-ai-glow" />
            Что важно помнить об инвесторе
          </div>
          <p className="text-sm text-primary leading-relaxed">{session.summary}</p>
        </div>
      )}

      {!compact && objections.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1.5">Возражения</div>
          <ul className="space-y-1.5">
            {objections.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-secondary">
                <span className="w-1 h-1 rounded-full bg-warning mt-1.5 shrink-0" />
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && materials.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1.5">Что отправить</div>
          <div className="flex flex-wrap gap-1.5">
            {materials.map((m, i) => (
              <StatusBadge key={i} tone="neutral">{m}</StatusBadge>
            ))}
          </div>
        </div>
      )}

      {!compact && session.followUpMessage && (
        <div className="rounded-md border border-ai/25 bg-ai/8 p-3 mb-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="text-[10px] uppercase tracking-[0.1em] text-ai-glow font-semibold">Готовое продолжение общения</div>
            <Button size="sm" variant="ghost" iconLeft={copied ? <Check size={12} /> : <Copy size={12} />} onClick={copyFollowUp}>
              {copied ? 'Скопировано' : 'Скопировать'}
            </Button>
          </div>
          <p className="text-sm text-primary leading-relaxed whitespace-pre-wrap">{session.followUpMessage}</p>
        </div>
      )}

      {compact && (
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-xs text-muted truncate">{session.summary ?? '—'}</span>
          <Button size="sm" variant="secondary" iconRight={<ArrowRight size={12} />}>Открыть</Button>
        </div>
      )}
    </Card>
  );
}

function QuickFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">
        {icon}
        {label}
      </div>
      <div className="text-xs text-primary mt-1 leading-snug line-clamp-2">{value}</div>
    </div>
  );
}
