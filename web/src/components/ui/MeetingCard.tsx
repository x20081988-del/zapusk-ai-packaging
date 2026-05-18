import { useState } from 'react';
import { Copy, Check, ArrowRight, Sparkles, UserRound, Wallet, Calendar, FileText, Download } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { Modal } from './Modal';
import { type SalesSession, TONE_LABEL, TONE_BADGE, INVESTOR_TYPE_LABEL, parseJsonArray } from '../../lib/salesSessions';
import { formatDate } from '../../lib/format';

const TRANSCRIPT_QUALITY_LABEL: Record<NonNullable<SalesSession['transcriptQualityStatus']>, string> = {
  draft: 'Черновик (realtime)',
  clean: 'Финальная транскрипция',
  failed: 'Финал не получен',
  not_available: 'Транскрипция недоступна',
};

export function MeetingCard({ session, compact }: { session: SalesSession; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  // Sprint 61.HOTFIX (P0.8) — full transcript access. Backend already stores
  // SalesSession.transcript (clean if exists, else draft — see Sprint 60).
  // Memory card just never exposed it.
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const objections = parseJsonArray(session.objections);
  const materials = parseJsonArray(session.materialsToSend);
  const tone = session.tone ?? 'cold';
  const hasTranscript = Boolean(session.transcript && session.transcript.trim().length > 0);

  async function copyFollowUp() {
    if (!session.followUpMessage) return;
    await navigator.clipboard.writeText(session.followUpMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function copyTranscript() {
    if (!session.transcript) return;
    await navigator.clipboard.writeText(session.transcript);
    setTranscriptCopied(true);
    setTimeout(() => setTranscriptCopied(false), 1800);
  }

  function downloadTranscript() {
    if (!session.transcript) return;
    const blob = new Blob([session.transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const investor = (session.investorName ?? 'investor').replace(/[^a-zA-Zа-яА-Я0-9 _-]+/g, '').trim() || 'investor';
    const date = new Date(session.createdAt).toISOString().slice(0, 10);
    a.download = `transcript-${investor}-${date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            {/* Sprint 50 P1.3 — surface fallback honestly. Pre-Sprint-50 the
                badge was silently absent on meetings where AI fell through
                to mock, so the founder couldn't tell a real AI-card from a
                heuristic one. */}
            {session.fellBackToMock && (
              <StatusBadge tone="warning" dot>резервная карточка (AI недоступен)</StatusBadge>
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

      {/* Sprint 61.HOTFIX (P0.8) — transcript access. */}
      {!compact && hasTranscript && (
        <div className="mt-2 pt-2 border-t border-hairline flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <FileText size={11} />
            <span>Транскрипция доступна</span>
            {session.transcriptQualityStatus && (
              <StatusBadge tone={session.transcriptQualityStatus === 'clean' ? 'success' : session.transcriptQualityStatus === 'draft' ? 'ai' : 'warning'}>
                {TRANSCRIPT_QUALITY_LABEL[session.transcriptQualityStatus]}
              </StatusBadge>
            )}
          </div>
          <Button size="sm" variant="ghost" iconLeft={<FileText size={12} />} onClick={() => setTranscriptOpen(true)}>
            Открыть транскрипцию
          </Button>
        </div>
      )}

      {compact && (
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-xs text-muted truncate">{session.summary ?? '—'}</span>
          <Button size="sm" variant="secondary" iconRight={<ArrowRight size={12} />}>Открыть</Button>
        </div>
      )}

      {/* Sprint 61.HOTFIX (P0.8) — full transcript modal. Collapsed by
          default so 30K-char meeting transcripts don't blow the card. */}
      <Modal
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        title={`Транскрипция · ${session.investorName ?? 'без имени'}`}
        width="max-w-4xl"
        bodyClassName="p-5"
      >
        {hasTranscript ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {session.transcriptQualityStatus && (
                <StatusBadge tone={session.transcriptQualityStatus === 'clean' ? 'success' : session.transcriptQualityStatus === 'draft' ? 'ai' : 'warning'} dot>
                  {TRANSCRIPT_QUALITY_LABEL[session.transcriptQualityStatus]}
                </StatusBadge>
              )}
              <span className="text-[11px] text-muted">
                {(session.transcript ?? '').length.toLocaleString('ru-RU')} символов
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="ghost" iconLeft={transcriptCopied ? <Check size={12} /> : <Copy size={12} />} onClick={copyTranscript}>
                  {transcriptCopied ? 'Скопировано' : 'Копировать'}
                </Button>
                <Button size="sm" variant="secondary" iconLeft={<Download size={12} />} onClick={downloadTranscript}>
                  Скачать .txt
                </Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-md border border-hairline bg-canvas/40 p-4">
              <pre className="text-sm text-primary whitespace-pre-wrap leading-relaxed font-sans">
                {session.transcript}
              </pre>
            </div>
            {session.transcriptQualityStatus === 'draft' && (
              <p className="text-[11px] text-muted leading-snug">
                Это черновик realtime-распознавания. Если был загружен звук встречи — финальная
                версия (offline) появится здесь автоматически после обработки.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Транскрипция этой встречи недоступна.</p>
        )}
      </Modal>
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
