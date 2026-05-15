import { useEffect, useRef, useState } from 'react';
import {
  UploadCloud, FileAudio, Link2, ClipboardPaste, Sparkles, AlertTriangle, CheckCircle2,
  XCircle, MessageSquare, Wand2, Copy, Check, History, Headphones,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { AddToKnowledgeBaseButton } from '../components/ui/AddToKnowledgeBaseButton';
import { ConversationScoreCard } from '../components/ui/ConversationScoreCard';
import {
  analyzeConversationUpload, analyzeConversationText, listAnalyses,
  parseAnalysisJSON,
  type ConversationAnalysisCard, type ConversationAnalysisRow,
} from '../lib/conversationAnalysis';
import { api, type Project } from '../lib/api';
import { getAuth } from '../lib/auth';
import { formatDate } from '../lib/format';

type Mode = 'upload' | 'paste' | 'url';

export default function ConversationAnalysis() {
  const [mode, setMode] = useState<Mode>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [projectId, setProjectId] = useState('');
  const [investorName, setInvestorName] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversationAnalysisCard | null>(null);
  const [history, setHistory] = useState<ConversationAnalysisRow[]>([]);
  const [drag, setDrag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => setProjects(r.projects));
    listAnalyses().then((r) => setHistory(r.analyses)).catch(() => setHistory([]));
  }, []);

  function refreshHistory() {
    listAnalyses().then((r) => setHistory(r.analyses)).catch(() => {});
  }

  async function run() {
    setError(null);
    setRunning(true);
    try {
      let res;
      if (mode === 'upload') {
        if (!file) { setError('Прикрепите аудио или видео файл.'); setRunning(false); return; }
        const form = new FormData();
        form.append('file', file);
        if (projectId) form.append('projectId', projectId);
        if (investorName.trim()) form.append('investorName', investorName.trim());
        res = await analyzeConversationUpload(form);
      } else if (mode === 'paste') {
        if (transcriptText.trim().length < 20) { setError('Transcript слишком короткий — нужно минимум 20 символов.'); setRunning(false); return; }
        res = await analyzeConversationText({
          transcript: transcriptText.trim(),
          projectId: projectId || null,
          investorName: investorName.trim() || null,
        });
      } else {
        if (!audioUrl.trim()) { setError('Вставьте ссылку на запись.'); setRunning(false); return; }
        res = await analyzeConversationText({
          audioUrl: audioUrl.trim(),
          projectId: projectId || null,
          investorName: investorName.trim() || null,
        });
      }
      setResult(res.analysis);
      refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'analysis_failed');
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setFile(null);
    setTranscriptText('');
    setAudioUrl('');
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <AppLayout
      title="AI-разбор переговоров"
      action={
        <Link to="/sales-assistant">
          <Button variant="ghost" size="sm" iconLeft={<Headphones size={14} />}>AI-ассистент</Button>
        </Link>
      }
    >
      <Card padded className="mb-6">
        <CardHeader
          title="Загрузите разговор — получите AI-разбор"
          subtitle="Запись из Zoom, Telegram, диктофона или WhatsApp. AI сделает расшифровку разговора, найдёт ошибки и предложит следующий шаг."
        />

        {/* Mode tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          <TabButton active={mode === 'upload'} onClick={() => setMode('upload')} icon={<UploadCloud size={13} />} label="Загрузить аудио" />
          <TabButton active={mode === 'paste'} onClick={() => setMode('paste')} icon={<ClipboardPaste size={13} />} label="Вставить transcript" />
          <TabButton active={mode === 'url'} onClick={() => setMode('url')} icon={<Link2 size={13} />} label="Ссылка на запись" />
        </div>

        {/* Common fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <Input
            label="Инвестор (опционально)"
            placeholder="Например: Виктор Николаевич"
            value={investorName}
            onChange={(e) => setInvestorName(e.target.value)}
          />
          <Select
            label="Проект (опционально)"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={[{ value: '', label: 'Без привязки к проекту' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </div>

        {/* Input area */}
        {mode === 'upload' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault(); setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-md border-2 border-dashed p-8 text-center cursor-pointer transition-all ${drag ? 'border-zapusk bg-zapusk/5' : 'border-line bg-canvas hover:border-zapusk/50'}`}
          >
            <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${file ? 'bg-success/15 border border-success/30' : 'bg-surface border border-line'}`}>
              {file ? <FileAudio size={20} className="text-success" /> : <UploadCloud size={20} className="text-secondary" />}
            </div>
            {file ? (
              <div>
                <div className="text-sm font-medium text-primary">{file.name}</div>
                <div className="text-xs text-muted mt-1">{Math.round(file.size / 1024)} КБ · {file.type || 'audio/*'}</div>
              </div>
            ) : (
              <div>
                <div className="text-sm text-primary">Перетащите файл или нажмите для выбора</div>
                <div className="text-xs text-muted mt-1">MP3 · WAV · M4A · MP4 · до 60 МБ</div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/mp4,.m4a,.mp3,.wav,.mp4"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        {mode === 'paste' && (
          <Textarea
            label="Transcript разговора"
            rows={10}
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder={'Менеджер: ...\nИнвестор: ...\n\nИли просто вставьте текст разговора как есть.'}
          />
        )}

        {mode === 'url' && (
          <Input
            label="Ссылка на запись"
            placeholder="https://drive.google.com/... или https://aicallscloud.ru/..."
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            hint="MVP сохраняет ссылку — для автоматической транскрипции загрузите файл напрямую."
          />
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button
            variant="ai"
            size="lg"
            iconLeft={<Sparkles size={15} />}
            loading={running}
            onClick={run}
            disabled={running || (mode === 'upload' && !file) || (mode === 'paste' && !transcriptText.trim()) || (mode === 'url' && !audioUrl.trim())}
          >
            {running ? 'AI анализирует…' : 'Запустить AI-разбор'}
          </Button>
          {(file || transcriptText || audioUrl) && (
            <Button variant="ghost" onClick={reset} disabled={running}>Очистить</Button>
          )}
        </div>
      </Card>

      {result && (
        <div className="space-y-4 animate-rise">
          <ConversationScoreCard card={result} />
          <ResultBlocks card={result} />
        </div>
      )}

      {/* History */}
      <Card padded className="mt-6">
        <CardHeader
          title="История разборов"
          subtitle="Каждый разбор сохраняется для команды и будущего тренинга Zapusk AI"
          action={<StatusBadge tone="ai" dot>{history.length}</StatusBadge>}
        />
        {history.length === 0 ? (
          <EmptyState title="Пока разборов нет" description="Загрузите первый разговор — он появится здесь, и команда сможет к нему вернуться." />
        ) : (
          <ul className="space-y-2">
            {history.slice(0, 10).map((h) => {
              const card = parseAnalysisJSON(h.analysis);
              return (
                <li key={h.id} className="rounded-md border border-hairline bg-canvas/40 px-3 py-3 hover:border-ai/35 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {h.sentiment && (
                          <StatusBadge tone={h.sentiment === 'positive' ? 'success' : h.sentiment === 'negative' ? 'danger' : 'warning'} dot>
                            {h.sentiment}
                          </StatusBadge>
                        )}
                        {h.aiScore != null && (
                          <span className={`text-[12px] font-bold font-num ${h.aiScore >= 75 ? 'text-success' : h.aiScore >= 50 ? 'text-zapusk-400' : 'text-warning'}`}>
                            {h.aiScore}/100
                          </span>
                        )}
                        <span className="text-[11px] text-muted">{formatDate(h.createdAt)}</span>
                      </div>
                      <div className="text-sm font-medium text-primary truncate">
                        {h.investorName ?? 'Инвестор без имени'}
                        {h.project && <span className="text-muted ml-2 text-xs">· {h.project.name}</span>}
                      </div>
                      {card?.summary && (
                        <p className="text-xs text-secondary mt-1 line-clamp-2">{card.summary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Sprint 42 P0.3 — admin/manager могут добавить разбор
                          как kandidat в KB. Footprint минимальный — кнопка
                          сама себя скрывает для FOUNDER (см. AddToKb...). */}
                      <AddToKnowledgeBaseButton
                        conversationAnalysisId={h.id}
                        defaultSourceType="meeting_recording"
                      />
                      {card && (
                        <Button size="sm" variant="ghost" iconLeft={<History size={12} />} onClick={() => setResult(card)}>
                          Открыть
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppLayout>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 h-9 rounded-md border text-sm transition-colors ${active ? 'bg-ai/10 border-ai/40 text-primary' : 'bg-canvas border-line text-secondary hover:text-primary hover:border-zapusk/40'}`}
    >
      {icon}
      {label}
    </button>
  );
}

function ResultBlocks({ card }: { card: ConversationAnalysisCard }) {
  const [copied, setCopied] = useState(false);
  async function copyFollowUp() {
    if (!card.followUpMessage) return;
    await navigator.clipboard.writeText(card.followUpMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <Card padded>
        <CardHeader title="Summary встречи" subtitle="Короткое резюме для быстрого скана" />
        <p className="text-sm text-primary leading-relaxed">{card.summary}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <Field icon={<Sparkles size={12} className="text-ai-glow" />} label="Интерес инвестора" value={card.investorInterest} />
          <Field icon={<Wand2 size={12} className="text-zapusk-400" />} label="Совет менеджеру" value={card.managerAdvice} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padded>
          <CardHeader title="Что улучшить" subtitle="Главные ошибки и upgrade-точки" />
          {card.mistakes.length ? (
            <ul className="space-y-2">
              {card.mistakes.map((m, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-primary">
                  <XCircle size={14} className="text-danger mt-0.5 shrink-0" />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">AI не нашёл явных ошибок — разговор шёл по структуре.</p>
          )}
        </Card>

        <Card padded>
          <CardHeader title="Что сработало" subtitle="Сильные моменты, которые стоит закрепить" />
          {card.whatWorked.length ? (
            <ul className="space-y-2">
              {card.whatWorked.map((m, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-primary">
                  <CheckCircle2 size={14} className="text-success mt-0.5 shrink-0" />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">AI не выделил явных сильных моментов.</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padded>
          <CardHeader title="Возражения инвестора" />
          {card.investorConcerns.length ? (
            <ul className="space-y-2">
              {card.investorConcerns.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-secondary">
                  <AlertTriangle size={13} className="text-warning mt-0.5 shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Без явных возражений.</p>
          )}
        </Card>

        <Card padded>
          <CardHeader title="Что отправить инвестору" subtitle="Рекомендованные материалы" />
          {card.recommendedMaterials.length ? (
            <div className="flex flex-wrap gap-1.5">
              {card.recommendedMaterials.map((m, i) => <StatusBadge key={i} tone="neutral">{m}</StatusBadge>)}
            </div>
          ) : (
            <p className="text-sm text-muted">Нет конкретных запросов.</p>
          )}
        </Card>
      </div>

      <Card padded accent="zapusk">
        <CardHeader title="Следующий шаг" subtitle="Одно действие на 24-48 часов" />
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-grad-zapusk text-white flex items-center justify-center shrink-0">
            <Wand2 size={16} />
          </div>
          <div>
            <p className="text-sm text-primary leading-relaxed">{card.nextBestAction}</p>
          </div>
        </div>
      </Card>

      <Card padded accent="ai">
        <CardHeader
          title="Готовое продолжение общения"
          subtitle="Текст для мессенджера — можно отправить инвестору"
          action={
            <Button size="sm" variant="ghost" iconLeft={copied ? <Check size={12} /> : <Copy size={12} />} onClick={copyFollowUp}>
              {copied ? 'Скопировано' : 'Скопировать'}
            </Button>
          }
        />
        <div className="rounded-md border border-ai/25 bg-canvas px-3 py-3">
          <div className="flex items-start gap-2">
            <MessageSquare size={14} className="text-ai-glow mt-0.5 shrink-0" />
            <p className="text-sm text-primary leading-relaxed whitespace-pre-wrap">{card.followUpMessage}</p>
          </div>
        </div>
      </Card>

      {card.fellBackToMock && <MockModeNotice />}
    </>
  );
}

// Sprint 16: для client скрываем env-key подсказки (OPENAI_API_KEY / DEEPGRAM_API_KEY)
// — это admin/ops информация, фаундер видит только нейтральное «Демо-режим». Admin/
// manager получают полную диагностику для саппорта.
function MockModeNotice() {
  const role = getAuth()?.role ?? 'client';
  const isOps = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
  return (
    <Card padded className="border-warning/40 bg-warning/8">
      <div className="flex items-start gap-2 text-warning text-xs">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">Демо-режим.</span>{' '}
          {isOps
            ? 'AI или транскрипция временно недоступны — показан детерминированный fallback. Проверьте OPENAI_API_KEY / DEEPGRAM_API_KEY на сервере для полноценного анализа.'
            : 'AI-разбор временно недоступен — показан демонстрационный результат. Полный анализ появится автоматически, когда система восстановится.'}
        </div>
      </div>
    </Card>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas/45 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted font-semibold">
        {icon}
        {label}
      </div>
      <div className="text-sm text-primary mt-1 leading-snug">{value || '—'}</div>
    </div>
  );
}
