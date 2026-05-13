import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mic, Square, Headphones, AlertTriangle, Sparkles, MessageSquare, Target,
  Activity, ChevronRight, RefreshCw, Save, CheckCircle2,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Select, Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { MeetingCard } from '../components/ui/MeetingCard';
import { api, type Project } from '../lib/api';
import { getAuth } from '../lib/auth';
import { isLegacyDemoProject } from '../lib/demoMaterials';
import { completeMeeting, type CompleteResult } from '../lib/salesSessions';

// ─── Web Speech API typing (browser-prefixed) ────────────────────────────────
interface SRResultLike { transcript: string; isFinal?: boolean }
interface SREventLike { resultIndex: number; results: ArrayLike<ArrayLike<SRResultLike> & { isFinal?: boolean }> }
type SRInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SREventLike) => void) | null;
  onerror: ((e: { error?: string } | Event) => void) | null;
  onend: (() => void) | null;
};
type SRCtor = new () => SRInstance;
function getSR(): SRCtor | null {
  const w = window as typeof window & { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─── Card shape returned by /api/sales-assistant/analyze ─────────────────────
interface AssistantCard {
  situation: string;
  risk: string | null;
  recommendation: string;
  suggestedPhrase: string;
  spinStage: 'S' | 'P' | 'I' | 'N';
  tone: 'SOFT' | 'CONTROL' | 'CLOSE';
  confidence: number;
  objection: string | null;
  nextStep: string | null;
  source: 'ai' | 'mock';
  provider: string;
  model: string;
  fellBackToMock: boolean;
}

type SpeechStatus = 'idle' | 'listening' | 'restarting' | 'stopped' | 'mic_error';
type AdviceHistoryItem = Pick<AssistantCard, 'situation' | 'recommendation' | 'suggestedPhrase' | 'spinStage' | 'tone' | 'nextStep'>;

const STAGE_LABEL: Record<AssistantCard['spinStage'], string> = {
  S: 'S — Situation',
  P: 'P — Problem',
  I: 'I — Implication',
  N: 'N — Need-Payoff',
};
const STAGE_HINT: Record<AssistantCard['spinStage'], string> = {
  S: 'Раскрываем контекст инвестора',
  P: 'Ищем неудовлетворённость',
  I: 'Усиливаем — без манипуляции',
  N: 'Подводим к деньгам',
};
const TONE_TONE: Record<AssistantCard['tone'], 'info' | 'zapusk' | 'success'> = {
  SOFT: 'info',
  CONTROL: 'zapusk',
  CLOSE: 'success',
};

export default function SalesAssistant() {
  const [projects, setProjects] = useState<Project[]>([]);
  const role = getAuth()?.role ?? 'client';
  const [projectId, setProjectId] = useState<string>('');
  const [listening, setListening] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Array<{ ts: number; final: boolean; text: string }>>([]);
  const [interim, setInterim] = useState('');
  const [card, setCard] = useState<AssistantCard | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [adviceHistory, setAdviceHistory] = useState<AdviceHistoryItem[]>([]);
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>('idle');
  // Investor Meeting Memory: «Завершить встречу» → AI summary → сохраняем как SalesSession.
  const [finishing, setFinishing] = useState(false);
  const [finishResult, setFinishResult] = useState<CompleteResult | null>(null);
  const [investorName, setInvestorName] = useState('');
  const [investorPhone, setInvestorPhone] = useState('');
  const startedAtRef = useRef<string | null>(null);

  const srRef = useRef<SRInstance | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const shouldListenRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const analyzingRef = useRef(false);
  const transcriptLinesRef = useRef<Array<{ ts: number; final: boolean; text: string }>>([]);
  const speechStatusRef = useRef<SpeechStatus>('idle');
  const cardRef = useRef<AssistantCard | null>(null);
  const adviceHistoryRef = useRef<AdviceHistoryItem[]>([]);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Initial project list — agent ties advice to the active project's context.
  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => {
      setProjects(r.projects);
      if (r.projects[0]?.id) setProjectId(r.projects[0].id);
    });
  }, []);

  useEffect(() => {
    transcriptLinesRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    speechStatusRef.current = speechStatus;
  }, [speechStatus]);

  useEffect(() => {
    cardRef.current = card;
  }, [card]);

  useEffect(() => {
    adviceHistoryRef.current = adviceHistory;
  }, [adviceHistory]);

  useEffect(() => () => {
    shouldListenRef.current = false;
    recognitionActiveRef.current = false;
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    try { srRef.current?.stop(); } catch { /* ignore unmount race */ }
  }, []);

  // Auto-scroll transcript to bottom on new lines
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, interim]);

  function fullTranscript(): string {
    return transcriptLinesRef.current.filter((t) => t.final).map((t) => t.text).join('\n');
  }

  function recentContext(): string {
    const text = fullTranscript();
    return text.length > 6_000 ? text.slice(-6_000) : text;
  }

  function toAdviceHistoryItem(next: AssistantCard): AdviceHistoryItem {
    return {
      situation: next.situation,
      recommendation: next.recommendation,
      suggestedPhrase: next.suggestedPhrase,
      spinStage: next.spinStage,
      tone: next.tone,
      nextStep: next.nextStep,
    };
  }

  async function runAnalyze() {
    if (analyzingRef.current) return;
    const transcriptText = fullTranscript();
    if (transcriptText.trim().length < 10) {
      setPermError('Сначала начните прослушивание и скажите несколько фраз.');
      return;
    }
    analyzingRef.current = true;
    setAnalyzing(true);
    try {
      const r = await api.post<{ card: AssistantCard }>('/api/sales-assistant/analyze', {
        transcript: transcriptText.slice(-32_000),
        recentContext: recentContext(),
        previousAdvice: cardRef.current,
        previousSpinStage: cardRef.current?.spinStage ?? null,
        adviceHistory: adviceHistoryRef.current.slice(-6),
        projectId: projectId || null,
      });
      setCard(r.card);
      setAdviceHistory((prev) => [...prev, toAdviceHistoryItem(r.card)].slice(-6));
      setPermError(null);
    } catch (err) {
      // soft-fail — transcript keeps growing
      console.warn('[sales-assistant] analyze error', err);
    } finally {
      analyzingRef.current = false;
      setAnalyzing(false);
    }
  }

  function startRecognition() {
    if (recognitionActiveRef.current || srRef.current) return;
    const SR = getSR();
    if (!SR) {
      shouldListenRef.current = false;
      setListening(false);
      setPermError('Голосовой ввод не поддерживается в этом браузере. Откройте в Chrome / Edge / Safari.');
      speechStatusRef.current = 'mic_error';
      setSpeechStatus('mic_error');
      return;
    }
    try {
      const sr = new SR();
      sr.lang = 'ru-RU';
      sr.continuous = true;
      sr.interimResults = true;
      sr.onresult = (e) => {
        let interimText = '';
        const final: Array<{ ts: number; final: boolean; text: string }> = [];
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const t = (res?.[0]?.transcript ?? '').trim();
          if (!t) continue;
          if (res.isFinal) final.push({ ts: Date.now(), final: true, text: t });
          else interimText += (interimText ? ' ' : '') + t;
        }
        if (final.length) setTranscript((prev) => [...prev, ...final]);
        setInterim(interimText);
      };
      sr.onerror = (e) => {
        const code = (e as { error?: string }).error ?? '';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          shouldListenRef.current = false;
          setListening(false);
          recognitionActiveRef.current = false;
          if (srRef.current === sr) srRef.current = null;
          speechStatusRef.current = 'mic_error';
          setSpeechStatus('mic_error');
          setPermError('Доступ к микрофону не разрешён. Разрешите доступ в настройках браузера.');
          try { sr.stop(); } catch { /* ignore */ }
          return;
        }
        if (code === 'audio-capture') {
          shouldListenRef.current = false;
          setListening(false);
          recognitionActiveRef.current = false;
          if (srRef.current === sr) srRef.current = null;
          speechStatusRef.current = 'mic_error';
          setSpeechStatus('mic_error');
          setPermError('Браузер не видит микрофон. Проверьте устройство ввода и разрешения.');
          return;
        }
        if (shouldListenRef.current) {
          speechStatusRef.current = 'restarting';
          setSpeechStatus('restarting');
          setPermError(code ? `Распознавание временно остановилось (${code}), перезапускаю автоматически.` : null);
          return;
        }
      };
      sr.onend = () => {
        recognitionActiveRef.current = false;
        if (srRef.current === sr) srRef.current = null;
        if (shouldListenRef.current) {
          speechStatusRef.current = 'restarting';
          setSpeechStatus('restarting');
          if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
          restartTimerRef.current = window.setTimeout(() => {
            if (shouldListenRef.current) startRecognition();
          }, 350);
        } else if (speechStatusRef.current !== 'mic_error') {
          const next = transcriptLinesRef.current.length ? 'stopped' : 'idle';
          speechStatusRef.current = next;
          setSpeechStatus(next);
        }
      };
      srRef.current = sr;
      sr.start();
      recognitionActiveRef.current = true;
      setListening(true);
      speechStatusRef.current = 'listening';
      setSpeechStatus('listening');
      setPermError(null);
    } catch (err) {
      shouldListenRef.current = false;
      setListening(false);
      srRef.current = null;
      recognitionActiveRef.current = false;
      speechStatusRef.current = 'mic_error';
      setSpeechStatus('mic_error');
      setPermError(err instanceof Error ? err.message : 'Не удалось включить распознавание речи');
    }
  }

  function start() {
    shouldListenRef.current = true;
    setPermError(null);
    if (!startedAtRef.current) startedAtRef.current = new Date().toISOString();
    startRecognition();
  }

  async function finishMeeting() {
    const transcriptText = fullTranscript();
    if (transcriptText.trim().length < 10) {
      setPermError('Слишком короткая встреча. Дайте AI хотя бы пару фраз для анализа.');
      return;
    }
    stop();
    setFinishing(true);
    try {
      const result = await completeMeeting({
        projectId: projectId || null,
        transcript: transcriptText,
        adviceHistory: adviceHistoryRef.current.slice(-6),
        investorName: investorName.trim() || null,
        investorPhone: investorPhone.trim() || null,
        startedAt: startedAtRef.current,
        endedAt: new Date().toISOString(),
      });
      setFinishResult(result);
    } catch (err) {
      setPermError(err instanceof Error ? err.message : 'Не удалось завершить встречу');
    } finally {
      setFinishing(false);
    }
  }

  function closeFinishModal() {
    setFinishResult(null);
    // Reset transcript so next meeting starts clean. Investor fields keep state
    // — менеджеру обычно нужно проводить серию встреч с одним проектом.
    setTranscript([]);
    setInterim('');
    setCard(null);
    setAdviceHistory([]);
    startedAtRef.current = null;
    speechStatusRef.current = 'idle';
    setSpeechStatus('idle');
  }

  function stop() {
    shouldListenRef.current = false;
    setListening(false);
    speechStatusRef.current = 'stopped';
    setSpeechStatus('stopped');
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    try { srRef.current?.stop(); } catch { /* ignore */ }
    srRef.current = null;
    recognitionActiveRef.current = false;
    setInterim('');
  }

  function reset() {
    setTranscript([]);
    setInterim('');
    setCard(null);
    setAdviceHistory([]);
    speechStatusRef.current = 'idle';
    setSpeechStatus('idle');
    setPermError(null);
  }

  const wordCount = useMemo(
    () => transcript.filter((t) => t.final).reduce((acc, t) => acc + t.text.split(/\s+/).length, 0),
    [transcript],
  );
  const hasFinalTranscript = transcript.some((t) => t.final);
  const visibleProjects = useMemo(
    () => projects.filter((p) => role !== 'client' || !isLegacyDemoProject(p)),
    [role, projects],
  );

  const statusText: Record<SpeechStatus, { title: string; hint: string }> = {
    idle: {
      title: 'Готов к старту',
      hint: 'Нажмите «Начать прослушивание» и разрешите доступ к микрофону.',
    },
    listening: {
      title: 'Слушает',
      hint: 'Говорите естественно. Паузы не завершают встречу, распознавание перезапускается автоматически.',
    },
    restarting: {
      title: 'Перезапуск распознавания',
      hint: 'Браузер завершил короткую speech-сессию, ассистент продолжает слушать автоматически.',
    },
    stopped: {
      title: 'Остановлено пользователем',
      hint: 'Можно продолжить встречу или сбросить текущую транскрипцию.',
    },
    mic_error: {
      title: 'Ошибка микрофона',
      hint: 'Проверьте разрешение браузера и устройство ввода.',
    },
  };
  const providerLabel = card?.fellBackToMock || card?.source === 'mock'
    ? 'Mock'
    : card?.provider === 'openai'
      ? 'OpenAI'
      : card?.provider;

  return (
    <AppLayout
      title="AI-ассистент на продажах"
      action={
        <div className="flex items-center gap-2">
          {visibleProjects.length > 0 && (
            <div className="w-64">
              <Select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                options={[{ value: '', label: 'Без привязки к проекту' }, ...visibleProjects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
          )}
          {listening
            ? <Button variant="danger" iconLeft={<Square size={14} />} onClick={stop}>Остановить</Button>
            : <Button variant="primary" iconLeft={<Mic size={14} />} onClick={start}>Начать прослушивание</Button>}
          <Button
            variant="ai"
            iconLeft={<RefreshCw size={14} />}
            onClick={runAnalyze}
            loading={analyzing}
            disabled={!hasFinalTranscript}
          >
            Обновить подсказку
          </Button>
          <Button
            variant="primary"
            iconLeft={<Save size={14} />}
            onClick={finishMeeting}
            loading={finishing}
            disabled={!hasFinalTranscript}
            title="Превратить разговор в карточку сделки"
          >
            Завершить встречу
          </Button>
          {transcript.length > 0 && !listening && (
            <Button variant="ghost" onClick={reset}>Сбросить</Button>
          )}
        </div>
      }
    >
      {/* Status row */}
      <Card padded className="mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-md flex items-center justify-center ${listening ? 'bg-grad-zapusk shadow-glow text-canvas' : 'bg-elevated border border-line text-secondary'}`}>
              <Headphones size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-primary">
                {statusText[speechStatus].title}
              </div>
              <div className="text-xs text-muted">
                {statusText[speechStatus].hint}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted">
            <span><span className="text-primary font-num text-sm">{wordCount}</span> слов</span>
            <span><span className="text-primary font-num text-sm">{transcript.filter((t) => t.final).length}</span> реплик</span>
            {speechStatus === 'listening' && <StatusBadge tone="success" dot>слушает</StatusBadge>}
            {speechStatus === 'restarting' && <StatusBadge tone="warning" dot>перезапуск</StatusBadge>}
            {speechStatus === 'stopped' && <StatusBadge tone="neutral" dot>остановлено</StatusBadge>}
            {speechStatus === 'mic_error' && <StatusBadge tone="danger" dot>ошибка микрофона</StatusBadge>}
            {hasFinalTranscript && !analyzing && <StatusBadge tone="info" dot>готов обновить подсказку</StatusBadge>}
            {analyzing && <StatusBadge tone="ai" dot>обновляем подсказку</StatusBadge>}
            {card && <StatusBadge tone={card.fellBackToMock || card.source === 'mock' ? 'neutral' : 'success'} dot>{providerLabel}</StatusBadge>}
          </div>
        </div>
        {permError && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {permError}
          </div>
        )}
      </Card>

      {/* Investor identification — нужно для Meeting Memory */}
      <Card padded className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Инвестор (имя)"
            placeholder="Например: Виктор Николаевич"
            value={investorName}
            onChange={(e) => setInvestorName(e.target.value)}
          />
          <Input
            label="Телефон или контакт"
            placeholder="+7 921 ..."
            value={investorPhone}
            onChange={(e) => setInvestorPhone(e.target.value)}
          />
        </div>
        <p className="text-[11px] text-muted mt-2">
          Эти поля попадут в карточку встречи. Можно оставить пустыми — система сохранит «инвестор без имени».
        </p>
      </Card>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6">
        {/* TRANSCRIPT */}
        <Card padded>
          <CardHeader title="Живая транскрипция" subtitle="Слева растёт диалог встречи в реальном времени" />
          <div
            ref={transcriptRef}
            className="bg-canvas border border-hairline rounded-md p-4 h-[60vh] overflow-y-auto space-y-2"
          >
            {transcript.length === 0 && !interim && (
              <p className="text-sm text-muted text-center py-8">
                Транскрипция появится здесь после старта.
              </p>
            )}
            {transcript.filter((t) => t.final).map((t, i) => (
              <p key={i} className="text-[13.5px] text-primary leading-relaxed">
                {t.text}
              </p>
            ))}
            {interim && (
              <p className="text-[13.5px] text-muted italic leading-relaxed">{interim}…</p>
            )}
          </div>
        </Card>

        {/* AI ADVICE */}
        <div className="space-y-4">
          {!card && (
            <Card padded className="text-center py-12">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-ai/15 border border-ai/30 flex items-center justify-center text-ai-glow">
                <Sparkles size={18} />
              </div>
              <h3 className="text-base font-semibold text-primary mb-1">Подсказки появятся здесь</h3>
              <p className="text-xs text-secondary max-w-sm mx-auto">
                Скажите несколько фраз, затем нажмите «Обновить подсказку» — ассистент определит этап SPIN, тон и предложит следующую реплику.
              </p>
            </Card>
          )}

          {card && <AdviceCard card={card} />}
        </div>
      </div>

      {/* «Завершить встречу» → AI summary modal с готовой карточкой сделки */}
      <Modal open={finishResult !== null} onClose={closeFinishModal} title="AI сохранил контекст встречи" width="max-w-3xl">
        {finishResult && (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-success/10 border border-success/30">
              <CheckCircle2 size={16} className="text-success mt-0.5 shrink-0" />
              <div className="text-sm text-primary">
                Встреча сохранена в Память встреч. Готовы карточка сделки, next step и follow-up — можно отправлять инвестору.
              </div>
            </div>
            <MeetingCard session={finishResult.session} />
            <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
              <Button variant="ghost" onClick={closeFinishModal}>Закрыть</Button>
              <Link to="/meetings">
                <Button variant="secondary">Открыть все встречи</Button>
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

function AdviceCard({ card }: { card: AssistantCard }) {
  return (
    <Card padded accent={card.tone === 'CLOSE' ? 'zapusk' : 'ai'}>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <StatusBadge tone="ai" dot>{STAGE_LABEL[card.spinStage]}</StatusBadge>
          <StatusBadge tone={TONE_TONE[card.tone]} dot>Тон · {card.tone}</StatusBadge>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted">Уверенность</div>
          <div className={`text-base font-bold font-num ${card.confidence >= 60 ? 'text-success' : card.confidence >= 35 ? 'text-zapusk-400' : 'text-warning'}`}>
            {card.confidence}%
          </div>
        </div>
      </div>
      <div className="text-[11px] text-muted mb-4">{STAGE_HINT[card.spinStage]}</div>
      <AdviceFields card={card} />
    </Card>
  );
}

function AdviceFields({ card, compact }: { card: AssistantCard; compact?: boolean }) {
  return (
    <div className={`space-y-${compact ? '3' : '4'}`}>
      <Field icon={<Activity size={14} />} label="Что происходит">{card.situation}</Field>
      {card.risk && (
        <Field icon={<AlertTriangle size={14} className="text-warning" />} label="Где риск" tone="warning">
          {card.risk}
        </Field>
      )}
      <Field icon={<Target size={14} className="text-zapusk-400" />} label="Что делать">{card.recommendation}</Field>
      <div>
        <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1.5 flex items-center gap-1.5">
          <MessageSquare size={12} className="text-ai-glow" />
          Что сказать сейчас
        </div>
        <blockquote className="bg-canvas border border-ai/30 rounded-md px-4 py-3 text-[14.5px] leading-relaxed text-primary">
          «{card.suggestedPhrase}»
        </blockquote>
      </div>
      {card.objection && (
        <Field icon={<AlertTriangle size={14} className="text-warning" />} label="Возражение" tone="warning">
          {card.objection}
        </Field>
      )}
      {card.nextStep && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-zapusk/8 border border-zapusk/25">
          <ChevronRight size={14} className="text-zapusk-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-zapusk-400 font-semibold mb-0.5">Следующий шаг</div>
            <div className="text-sm text-primary">{card.nextStep}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ icon, label, tone, children }: { icon: React.ReactNode; label: string; tone?: 'warning'; children: React.ReactNode }) {
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-[0.1em] font-semibold mb-1 flex items-center gap-1.5 ${tone === 'warning' ? 'text-warning' : 'text-muted'}`}>
        {icon}
        {label}
      </div>
      <div className="text-sm text-primary leading-relaxed">{children}</div>
    </div>
  );
}
