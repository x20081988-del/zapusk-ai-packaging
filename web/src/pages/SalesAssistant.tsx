import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mic, Square, Headphones, AlertTriangle, Sparkles, MessageSquare, Target,
  Activity, ChevronRight, RefreshCw, Save, CheckCircle2, Upload,
  Compass, ShieldAlert, HelpCircle, Megaphone, Ban, Gauge, Zap,
  HeartHandshake, Brain, Thermometer, TrendingUp, TrendingDown, Minus,
  HeartCrack, Wand2, UserRound, BookOpen,
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
import { createOutcome, OUTCOME_OPTIONS, OUTCOME_LABELS, type OutcomeType } from '../lib/assistantOutcomes';

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
// Sprint 12: расширили AssistantCard до structured mini-brief.
// Legacy aliases (risk / recommendation / suggestedPhrase / nextStep) сохраняем
// — старая история adviceHistory остаётся совместимой с новым API.
interface AssistantCard {
  situation: string;
  riskOrMissed: string | null;
  whatToDo: string[];
  whatNotToDo: string[];
  mainQuestion: string;
  backupQuestions: string[];
  selfSaleQuestions: string[];
  miniPitch: string | null;
  conversationObjective: string;
  conversationDirection: string;
  dealNextStep: string | null;
  spinStage: 'S' | 'P' | 'I' | 'N';
  spinGaps: Array<'S' | 'P' | 'I' | 'N'>;
  tone: 'SOFT' | 'CONTROL' | 'CLOSE';
  dealControlLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  engagementSignal: 'active' | 'passive' | 'disengaged';
  confidence: number;
  objection: string | null;

  // Sprint 13: emotional layer
  emotionalState: string;
  whyBehavior: string;
  investorState: 'OPEN' | 'CURIOUS' | 'SKEPTICAL' | 'DEFENSIVE' | 'ENGAGED' | 'RATIONALIZING' | 'READY' | 'DISCONNECTED';
  momentum: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  momentumReason: string;
  conversationTemperature: 'COLD' | 'WARM' | 'HOT';
  emotionalRisks: string[];
  toneShiftGuidance: string;

  // legacy aliases (back-compat with older clients / analytics)
  risk: string | null;
  recommendation: string;
  suggestedPhrase: string;
  nextStep: string | null;

  source: 'ai' | 'mock';
  provider: string;
  model: string;
  fellBackToMock: boolean;
  // Sprint 34Б.2 — откуда AI взял system-prompt.
  //   'db'       — активный template 'sales_gpt' из суперадминки (правильное состояние)
  //   'fallback' — hardcoded prompt из кода (template отсутствует / выключен)
  promptSource?: 'db' | 'fallback';
  promptTemplateId?: string | null;
  // Sprint 38 — KB-источники, использованные в подсказке. Founder получает
  // только title + sourceType + summary; admin/manager — также snippet.
  usedKnowledgeSources?: UsedKnowledgeSource[];
}

// Sprint 38 — KB-источник, использованный AI-подсказкой.
export interface UsedKnowledgeSource {
  sourceId: string;
  title: string;
  sourceType: string;
  scope: 'global' | 'project';
  summary: string | null;
  // Null для founder, заполнен для admin/manager.
  snippet: string | null;
}

// Sprint 34В — fast тактический ответ (этап 1 двухэтапной генерации).
interface FastCardShape {
  mainQuestion: string;
  backupQuestions: string[];
  selfSaleQuestions: string[];
  spinStage: AssistantCard['spinStage'];
  // Hotfix 2026-05-15 — backend возвращает source='mock', когда AI вернул
  // пустоту / парсинг JSON упал. Используем это для бейджа «резервная подсказка»
  // и для приоритезации полной аналитики над сырым fallback.
  source?: 'ai' | 'mock';
  provider: string;
  model: string;
  fellBackToMock: boolean;
  promptSource?: 'db' | 'fallback';
  promptTemplateId?: string | null;
  // Sprint 38 — KB-источники в fast-ответе тоже.
  usedKnowledgeSources?: UsedKnowledgeSource[];
}

type SpeechStatus = 'idle' | 'listening' | 'restarting' | 'stopped' | 'mic_error';
type AdviceHistoryItem = Pick<
  AssistantCard,
  | 'situation'
  | 'mainQuestion'
  | 'whatToDo'
  | 'spinStage'
  | 'tone'
  | 'dealNextStep'
  | 'conversationObjective'
  // legacy fields still emitted for older consumers
  | 'recommendation'
  | 'suggestedPhrase'
  | 'nextStep'
>;

// Sprint 34Б.3 — русские лейблы вместо S/P/I/N. Внутренние enum-значения
// остаются англоязычными (контракт с AI и БД), но интерфейс показывает русскую
// букву + полное название этапа СПИН.
const STAGE_LABEL: Record<AssistantCard['spinStage'], string> = {
  S: 'С — Ситуация',
  P: 'П — Проблема',
  I: 'У — Усиление',
  N: 'Р — Решение',
};
// Sprint 34Б.3 — для лейбла тона в badge.
const TONE_LABEL: Record<AssistantCard['tone'], string> = {
  SOFT: 'мягкий',
  CONTROL: 'контроль',
  CLOSE: 'закрытие',
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
const CONTROL_TONE: Record<AssistantCard['dealControlLevel'], 'danger' | 'warning' | 'success'> = {
  LOW: 'danger',
  MEDIUM: 'warning',
  HIGH: 'success',
};
const CONTROL_LABEL: Record<AssistantCard['dealControlLevel'], string> = {
  LOW: 'Контроль · низкий',
  MEDIUM: 'Контроль · средний',
  HIGH: 'Контроль · высокий',
};
const ENGAGEMENT_TONE: Record<AssistantCard['engagementSignal'], 'success' | 'warning' | 'danger'> = {
  active: 'success',
  passive: 'warning',
  disengaged: 'danger',
};
const ENGAGEMENT_LABEL: Record<AssistantCard['engagementSignal'], string> = {
  active: 'Инвестор · активен',
  passive: 'Инвестор · пассивен',
  disengaged: 'Инвестор · уходит',
};

// Sprint 13: emotional layer labels & tones
const STATE_LABEL: Record<AssistantCard['investorState'], string> = {
  OPEN: 'Открыт',
  CURIOUS: 'Любопытен',
  SKEPTICAL: 'Скептичен',
  DEFENSIVE: 'Защищается',
  ENGAGED: 'Вовлечён',
  RATIONALIZING: 'Рационализирует',
  READY: 'Готов',
  DISCONNECTED: 'Уходит',
};
const STATE_TONE: Record<AssistantCard['investorState'], 'success' | 'info' | 'warning' | 'danger' | 'zapusk' | 'neutral' | 'ai'> = {
  OPEN: 'info',
  CURIOUS: 'ai',
  SKEPTICAL: 'warning',
  DEFENSIVE: 'warning',
  ENGAGED: 'success',
  RATIONALIZING: 'warning',
  READY: 'zapusk',
  DISCONNECTED: 'danger',
};
const TEMP_LABEL: Record<AssistantCard['conversationTemperature'], string> = {
  COLD: 'Холодный контакт',
  WARM: 'Тёплый контакт',
  HOT: 'Горячий контакт',
};
const TEMP_TONE: Record<AssistantCard['conversationTemperature'], 'info' | 'warning' | 'danger' | 'success'> = {
  COLD: 'info',
  WARM: 'warning',
  HOT: 'success',
};
const MOMENTUM_LABEL: Record<AssistantCard['momentum'], string> = {
  POSITIVE: 'Растёт',
  NEUTRAL: 'Ровно',
  NEGATIVE: 'Падает',
};
const MOMENTUM_TONE: Record<AssistantCard['momentum'], 'success' | 'neutral' | 'danger'> = {
  POSITIVE: 'success',
  NEUTRAL: 'neutral',
  NEGATIVE: 'danger',
};

// Hotfix 2026-05-15 — лейбл кнопки зависит от фазы. Кнопка всегда кликабельна
// (новый клик abort'ит активный запрос), поэтому текст должен ясно показывать
// текущее состояние, а не «спиннер навсегда».
function analyzeButtonLabel(
  phase: 'idle' | 'fast' | 'full' | 'error',
  hasAnyCard: boolean,
): string {
  if (phase === 'fast') return 'Готовлю главный вопрос…';
  if (phase === 'full') return 'Обновить ещё раз';
  if (phase === 'error') return 'Повторить обновление';
  return hasAnyCard ? 'Обновить ещё раз' : 'Получить подсказку сейчас';
}

export default function SalesAssistant() {
  const [projects, setProjects] = useState<Project[]>([]);
  const role = getAuth()?.role ?? 'client';
  const [projectId, setProjectId] = useState<string>('');
  const [listening, setListening] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Array<{ ts: number; final: boolean; text: string }>>([]);
  const [interim, setInterim] = useState('');
  const [card, setCard] = useState<AssistantCard | null>(null);
  // Hotfix 2026-05-15 — единый явный конечный автомат вместо двух пересекающихся
  // флагов (analyzing + analyzePhase). Сейчас:
  //   • idle  — нет активного запроса; кнопка «Получить подсказку сейчас» / «Обновить ещё раз»
  //   • fast  — ждём ultra-fast tactical (~1-3 сек); кнопка «Готовлю главный вопрос…», но НЕ disabled
  //   • full  — fast пришёл, тянем полную аналитику (~5-15 сек); кнопка «Обновить ещё раз»
  //   • error — последний запуск упал; кнопка «Повторить обновление»
  // Кнопка во всех состояниях кликабельна — новый клик abort'ит текущий запрос
  // и стартует новый. Раньше `if (analyzingRef.current) return;` + loading=disabled
  // приводили к «вечному» залипанию UI, если сеть/OpenAI отвечали медленно.
  type AnalyzePhase = 'idle' | 'fast' | 'full' | 'error';
  const [analyzePhase, setAnalyzePhase] = useState<AnalyzePhase>('idle');
  const [fastCard, setFastCard] = useState<FastCardShape | null>(null);
  const [adviceHistory, setAdviceHistory] = useState<AdviceHistoryItem[]>([]);
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>('idle');
  // Sprint 34A: lastAnalyzeAt / aiError для UX обратной связи.
  // Sprint 34В: auto-refresh interval УБРАН — обновление только вручную.
  const [lastAnalyzeAt, setLastAnalyzeAt] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  // Investor Meeting Memory: «Завершить встречу» → AI summary → сохраняем как SalesSession.
  const [finishing, setFinishing] = useState(false);
  const [finishResult, setFinishResult] = useState<CompleteResult | null>(null);
  const [investorName, setInvestorName] = useState('');
  const [investorPhone, setInvestorPhone] = useState('');
  // Sprint 43 P0.6 — список adviceEventId'ов всех full analyze этой встречи.
  // На «Завершить встречу» передаём в /api/sales-sessions/complete, чтобы
  // backend пробросил salesSessionId в эти записи (link для outcome attribution).
  // adviceEventLast — последний полученный, фронт показывает кнопки «Зафиксировать
  // результат» с этим id.
  const [adviceEventIds, setAdviceEventIds] = useState<string[]>([]);
  const [adviceEventLast, setAdviceEventLast] = useState<string | null>(null);
  const startedAtRef = useRef<string | null>(null);

  const srRef = useRef<SRInstance | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const shouldListenRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  // Hotfix 2026-05-15 — sequence-id + AbortController:
  //   • analysisRequestIdRef растёт на каждый клик. Ответы старых запросов
  //     игнорируются (stale-guard) — даже если abort не сработал.
  //   • analysisAbortRef хранит текущий controller. На новом клике —
  //     отменяем предыдущий и создаём новый. Это убирает «зависание» UI,
  //     когда OpenAI отвечает долго и пользователь хочет нажать ещё раз.
  const analysisRequestIdRef = useRef(0);
  const analysisAbortRef = useRef<AbortController | null>(null);
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
    // Hotfix 2026-05-15 — отменяем висящий AI-запрос при размонтировании.
    if (analysisAbortRef.current) {
      try { analysisAbortRef.current.abort(); } catch { /* ignore */ }
      analysisAbortRef.current = null;
    }
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
      mainQuestion: next.mainQuestion,
      whatToDo: next.whatToDo,
      spinStage: next.spinStage,
      tone: next.tone,
      dealNextStep: next.dealNextStep,
      conversationObjective: next.conversationObjective,
      recommendation: next.recommendation,
      suggestedPhrase: next.suggestedPhrase,
      nextStep: next.nextStep,
    };
  }

  // Hotfix 2026-05-15 — двухэтапная генерация теперь:
  //   1. Имеет requestId-guard: если пользователь нажал кнопку второй раз,
  //      результаты первого запроса игнорируются даже если они придут.
  //   2. Использует AbortController на каждый клик. Старый запрос реально
  //      отменяется в сети — мы не ждём «висящего» fetch'а к OpenAI.
  //   3. Имеет жёсткие frontend-timeout'ы:
  //        fast = 8 секунд (соответствует backend guard)
  //        full = 25 секунд (соответствует backend guard)
  //      По истечении срабатывает abort и UI выходит в state='error'.
  //   4. После успешного full-ответа очищает fastCard, чтобы старая «резервная»
  //      реплика не висела поверх свежей полной аналитики.
  // SpeechRecognition при этом не трогается — это полностью независимый поток,
  // ошибки/таймауты AI на него не влияют.
  const FAST_TIMEOUT_MS = 8_000;
  const FULL_TIMEOUT_MS = 25_000;

  function isAbortError(err: unknown): boolean {
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    if (err instanceof Error && /aborted|abort/i.test(err.message)) return true;
    return false;
  }

  async function runAnalyze() {
    const transcriptText = fullTranscript();
    if (transcriptText.trim().length < 10) {
      setPermError('Сначала начните прослушивание и скажите несколько фраз.');
      return;
    }

    // Отменяем предыдущий запрос (если был). Stale-guard ниже отбросит его
    // результаты на случай, если abort не сработает мгновенно.
    if (analysisAbortRef.current) {
      console.debug('[sales-assistant] aborting previous request');
      try { analysisAbortRef.current.abort(); } catch { /* ignore */ }
    }
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const myRequestId = ++analysisRequestIdRef.current;
    const isStale = () => myRequestId !== analysisRequestIdRef.current;

    setAnalyzePhase('fast');
    setAiError(null);
    // Старый fastCard оставляем на экране до прихода нового результата —
    // меньше визуального «прыжка». Очистится либо новым fast, либо setCard.
    const windowed = transcriptText.slice(-8_000);
    const previousAdvice = cardRef.current;
    const previousSpinStage = cardRef.current?.spinStage ?? null;
    const adviceHistorySnapshot = adviceHistoryRef.current.slice(-6);
    const tFastStart = performance.now();
    console.debug(`[sales-assistant] requestId=${myRequestId} phase=fast start chars=${windowed.length} total=${transcriptText.length}`);

    // ── ЭТАП 1: ultra-fast tactical reply ───────────────────────────────
    const fastTimer = window.setTimeout(() => {
      if (!isStale()) {
        console.debug(`[sales-assistant] requestId=${myRequestId} phase=fast timeout ${FAST_TIMEOUT_MS}ms`);
        controller.abort();
      }
    }, FAST_TIMEOUT_MS);

    let fastOk = false;
    try {
      const r = await api.post<{ fast: FastCardShape }>(
        '/api/sales-assistant/analyze-fast',
        {
          transcript: windowed,
          recentContext: recentContext(),
          previousAdvice,
          previousSpinStage,
          adviceHistory: adviceHistorySnapshot,
          projectId: projectId || null,
        },
        { signal: controller.signal },
      );
      window.clearTimeout(fastTimer);
      if (isStale()) {
        console.debug(`[sales-assistant] requestId=${myRequestId} phase=fast stale, ignoring`);
        return;
      }
      const latencyMs = Math.round(performance.now() - tFastStart);
      console.debug(`[sales-assistant] requestId=${myRequestId} phase=fast done latencyMs=${latencyMs} spinStage=${r.fast.spinStage} source=${r.fast.source ?? 'ai'}`);
      setFastCard(r.fast);
      setLastAnalyzeAt(Date.now());
      setPermError(null);
      fastOk = true;
    } catch (err) {
      window.clearTimeout(fastTimer);
      if (isStale()) return;
      const message = err instanceof Error ? err.message : 'unknown';
      const wasAbort = isAbortError(err) || controller.signal.aborted;
      console.warn(`[sales-assistant] requestId=${myRequestId} phase=fast error message="${message}" abort=${wasAbort}`);
      if (wasAbort) {
        // Если abort — значит timeout сработал или пользователь нажал ещё раз.
        // В первом случае показываем понятную ошибку; во втором новый клик уже
        // увеличил requestId и эта ветка не выполнится (стreаgs выше).
        setAiError('Не удалось быстро получить подсказку, попробуйте ещё раз.');
      } else if (message.includes('workspace_readonly') || message.includes('403')) {
        setAiError('Демо-режим: AI-подсказки доступны после активации рабочего кабинета. Свяжитесь с менеджером.');
      } else {
        setAiError('Не удалось обновить подсказку. Транскрипция продолжается. Попробуйте ещё раз.');
      }
      setAnalyzePhase('error');
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null;
      return;
    }

    if (!fastOk || isStale()) return;

    // ── ЭТАП 2: полная аналитика (догоняет в фоне) ──────────────────────
    setAnalyzePhase('full');
    const tFullStart = performance.now();
    const fullTimer = window.setTimeout(() => {
      if (!isStale()) {
        console.debug(`[sales-assistant] requestId=${myRequestId} phase=full timeout ${FULL_TIMEOUT_MS}ms`);
        controller.abort();
      }
    }, FULL_TIMEOUT_MS);

    try {
      const r = await api.post<{ card: AssistantCard; adviceEventId?: string | null }>(
        '/api/sales-assistant/analyze',
        {
          transcript: windowed,
          recentContext: recentContext(),
          previousAdvice,
          previousSpinStage,
          adviceHistory: adviceHistorySnapshot,
          projectId: projectId || null,
        },
        { signal: controller.signal },
      );
      window.clearTimeout(fullTimer);
      if (isStale()) {
        console.debug(`[sales-assistant] requestId=${myRequestId} phase=full stale, ignoring`);
        return;
      }
      const latencyMs = Math.round(performance.now() - tFullStart);
      console.debug(`[sales-assistant] requestId=${myRequestId} phase=full done latencyMs=${latencyMs} spinStage=${r.card?.spinStage ?? '?'}`);
      setCard(r.card);
      // Полная аналитика свежее fast — снимаем fastCard, чтобы AdviceCard
      // взяла mainQuestion из card, а не из старого fallback'а.
      setFastCard(null);
      setAdviceHistory((prev) => [...prev, toAdviceHistoryItem(r.card)].slice(-6));
      setLastAnalyzeAt(Date.now());
      setAiError(null);
      setAnalyzePhase('idle');
      // Sprint 43 P0.6 — копим adviceEventIds текущей встречи. Бэкенд
      // вернёт null если запись advice event'а упала — это не критично, ID
      // просто не появится в массиве (и outcome нельзя будет линковать —
      // ok, спокойно живёт без линка по adviceEventId).
      if (r.adviceEventId) {
        setAdviceEventLast(r.adviceEventId);
        setAdviceEventIds((prev) => [...prev, r.adviceEventId as string]);
      }
    } catch (err) {
      window.clearTimeout(fullTimer);
      if (isStale()) return;
      const message = err instanceof Error ? err.message : 'unknown';
      const wasAbort = isAbortError(err) || controller.signal.aborted;
      console.warn(`[sales-assistant] requestId=${myRequestId} phase=full error message="${message}" abort=${wasAbort}`);
      // Fast уже на экране — мягкая ошибка про аналитику, без сброса fastCard.
      if (wasAbort) {
        setAiError('Полный разбор не обновился, можно повторить.');
      } else {
        setAiError('Аналитика временно недоступна. Главный вопрос и запасные показаны. Попробуйте обновить подсказку.');
      }
      setAnalyzePhase('error');
    } finally {
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null;
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
    // Sprint 34В — auto-refresh ОТКЛЮЧЁН. Транскрипция и AI-подсказка теперь
    // два независимых процесса:
    //   • Транскрипция идёт сама непрерывно (SpeechRecognition + restart loop)
    //   • AI-подсказка обновляется ТОЛЬКО по кнопке «Обновить подсказку»
    // Пользователь сам управляет моментом анализа.
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
        // Sprint 43 P0.4 — линкуем все advice events этой встречи. Backend
        // присвоит им salesSessionId, чтобы outcome'ы можно было аккуратно
        // атрибуцировать в дашбордах.
        adviceEventIds,
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
    // Sprint 34В — сброс AI state.
    setLastAnalyzeAt(null);
    setAiError(null);
    setFastCard(null);
    setAnalyzePhase('idle');
    // Sprint 43 — сброс advice tracking при новом meeting'е.
    setAdviceEventIds([]);
    setAdviceEventLast(null);
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
    // Sprint 34В — сброс AI state.
    setLastAnalyzeAt(null);
    setAiError(null);
    setFastCard(null);
    setAnalyzePhase('idle');
    // Hotfix 2026-05-15 — обнуляем sequence-id и abort'им висящий запрос.
    if (analysisAbortRef.current) {
      try { analysisAbortRef.current.abort(); } catch { /* ignore */ }
      analysisAbortRef.current = null;
    }
    analysisRequestIdRef.current++;
  }

  const wordCount = useMemo(
    () => transcript.filter((t) => t.final).reduce((acc, t) => acc + t.text.split(/\s+/).length, 0),
    [transcript],
  );
  const hasFinalTranscript = transcript.some((t) => t.final);
  const visibleProjects = useMemo(
    () => projects.filter((p) => role !== 'FOUNDER' || !isLegacyDemoProject(p)),
    [role, projects],
  );

  // Sprint 34В — отдельные статусы транскрипции и AI-подсказки.
  // Транскрипция идёт непрерывно; подсказка обновляется ТОЛЬКО по кнопке.
  const statusText: Record<SpeechStatus, { title: string; hint: string }> = {
    idle: {
      title: 'Готов к старту',
      hint: 'Нажмите «Начать прослушивание» и разрешите доступ к микрофону.',
    },
    listening: {
      title: 'Слушаю встречу',
      hint: 'Говорите естественно. Паузы не сбрасывают транскрипцию. Подсказку обновите по кнопке, когда нужно.',
    },
    // Sprint 34A/В — restarting рендерится как «Слушаю встречу», без отдельного title.
    // Браузер делит speech на сегменты; для пользователя это должно выглядеть
    // как непрерывное прослушивание.
    restarting: {
      title: 'Слушаю встречу',
      hint: 'Пауза в речи, продолжаю слушать. Транскрипция не прерывается.',
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
  // Sprint 16: убрали vendor name из status badge. Раньше фаундер видел
  // «OpenAI» рядом со sales-карточкой — это размывает позиционирование
  // «Zapusk AI оркестрирует AI стек». Теперь — «AI слушает встречу» /
  // «Демо-режим». Admin/manager при необходимости видит полное имя.
  const isMock = card?.fellBackToMock || card?.source === 'mock';
  const providerLabel = isMock
    ? 'Демо-режим'
    : role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER'
      ? (card?.provider === 'openai' ? 'OpenAI' : card?.provider ?? 'AI')
      : 'AI слушает встречу';

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
          <Link to="/conversation-analysis">
            <Button variant="secondary" size="md" iconLeft={<Upload size={14} />} title="Загрузить запись разговора для AI-разбора">
              Загрузить запись
            </Button>
          </Link>
          {listening
            ? <Button variant="danger" iconLeft={<Square size={14} />} onClick={stop}>Остановить</Button>
            : <Button variant="primary" iconLeft={<Mic size={14} />} onClick={start}>Начать прослушивание</Button>}
          {/* Hotfix 2026-05-15 — кнопка КЛИКАБЕЛЬНА всегда, даже во время
              активного запроса. Новый клик abort'ит предыдущий и стартует
              новый. Раньше loading=disabled + analyzingRef.current return
              приводили к «зависанию», когда сеть/OpenAI отвечали медленно. */}
          <Button
            variant="ai"
            iconLeft={<RefreshCw size={14} />}
            onClick={() => runAnalyze()}
            disabled={!hasFinalTranscript}
          >
            {analyzeButtonLabel(analyzePhase, Boolean(card || fastCard))}
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
          {/* Sprint 34В — две независимые дорожки статуса:
              ТРАНСКРИПЦИЯ (зелёная) идёт непрерывно;
              AI-ПОДСКАЗКА (синяя) обновляется ТОЛЬКО по кнопке. */}
          <div className="flex flex-col items-end gap-2 text-[11px] text-muted">
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <span className="text-[9px] uppercase tracking-[0.12em] text-muted font-semibold">Транскрипция:</span>
              <span><span className="text-primary font-num text-sm">{wordCount}</span> слов</span>
              <span><span className="text-primary font-num text-sm">{transcript.filter((t) => t.final).length}</span> реплик</span>
              {(speechStatus === 'listening' || speechStatus === 'restarting') && (
                <StatusBadge tone="success" dot>слушаю встречу</StatusBadge>
              )}
              {speechStatus === 'stopped' && <StatusBadge tone="neutral" dot>остановлено</StatusBadge>}
              {speechStatus === 'mic_error' && <StatusBadge tone="danger" dot>ошибка микрофона</StatusBadge>}
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <span className="text-[9px] uppercase tracking-[0.12em] text-muted font-semibold">AI-подсказка:</span>
              {analyzePhase === 'fast' && (
                <StatusBadge tone="ai" dot>AI готовит ответ…</StatusBadge>
              )}
              {analyzePhase === 'full' && (
                <StatusBadge tone="ai" dot>AI анализирует диалог…</StatusBadge>
              )}
              {analyzePhase === 'idle' && !lastAnalyzeAt && (
                <span className="text-muted">подсказка ещё не запрашивалась</span>
              )}
              {analyzePhase === 'idle' && lastAnalyzeAt && (
                <span className="text-muted">
                  обновлена в <span className="text-secondary">{new Date(lastAnalyzeAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              )}
              {aiError && <StatusBadge tone="warning" dot>{aiError.length > 60 ? 'Не удалось обновить' : aiError}</StatusBadge>}
              {/* Hotfix 2026-05-15 — бейдж «резервная подсказка», когда быстрый
                  блок отдал mock из-за пустого AI-ответа. Помогает понять, что
                  главный вопрос — не реальная аналитика, а fallback. */}
              {!card && fastCard && (fastCard.source === 'mock' || fastCard.fellBackToMock) && (
                <StatusBadge tone="warning" dot>резервная подсказка</StatusBadge>
              )}
              {card && <StatusBadge tone={card.fellBackToMock || card.source === 'mock' ? 'neutral' : 'success'} dot>{providerLabel}</StatusBadge>}
            {/* Sprint 34Б.2 — источник инструкции. 'db' = шаблон из суперадминки
                (правильно, prompt управляется без deploy). 'fallback' = hardcoded —
                означает что template отсутствует/выключен и нужно вмешательство admin'а. */}
            {card?.promptSource === 'db' && (
              <StatusBadge tone="info" dot>шаблон из админки</StatusBadge>
            )}
            {card?.promptSource === 'fallback' && (
              <StatusBadge tone="warning" dot>резервная инструкция — проверьте шаблон</StatusBadge>
            )}
            </div>
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
          {!card && !fastCard && (
            <Card padded className="text-center py-12">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-ai/15 border border-ai/30 flex items-center justify-center text-ai-glow">
                <Sparkles size={18} />
              </div>
              <h3 className="text-base font-semibold text-primary mb-1">Подсказки появятся здесь</h3>
              <p className="text-xs text-secondary max-w-sm mx-auto">
                Скажите несколько фраз, затем нажмите «Обновить подсказку» — ассистент определит этап СПИН, тон и предложит следующую реплику.
              </p>
            </Card>
          )}

          {/* Sprint 34В — fast tactical reply показывается СРАЗУ; полная
              аналитика догоняет в фоне. Если есть только fastCard (этап 2
              ещё в работе) — рендерим compact-карточку без analytics. */}
          {(card || fastCard) && (
            <AdviceCard
              card={card}
              fastCard={fastCard}
              analyzePhase={analyzePhase}
            />
          )}

          {/* Sprint 43 P0.7 — кнопки «Зафиксировать результат». Показываем
              после первой full-card И только если у нас есть adviceEventId
              (бэкенд успешно записал AssistantAdviceEvent). Если backend упал
              на запись advice event, кнопки не появятся — outcome без линка
              не имеет аналитической ценности на этом этапе. */}
          {card && adviceEventLast && (
            <OutcomePanel
              adviceEventId={adviceEventLast}
              projectId={projectId || null}
              investorName={investorName.trim() || null}
            />
          )}
        </div>
      </div>

      {/* «Завершить встречу» → AI summary modal с готовой карточкой сделки */}
      <Modal open={finishResult !== null} onClose={closeFinishModal} title="AI сохранил контекст встречи" width="max-w-3xl">
        {finishResult && (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-success/10 border border-success/30">
              <CheckCircle2 size={16} className="text-success mt-0.5 shrink-0" />
              <div className="text-sm text-primary">
                Встреча сохранена в Память встреч. Готовы карточка сделки, следующий шаг и продолжение общения — можно отправлять инвестору.
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

// Sprint 12: structured mini-brief. Каждая секция сканируется за 5 секунд.
// Sprint 34В: двухэтапная отрисовка. fastCard (mainQuestion + backupQuestions +
// selfSaleQuestions + spinStage) приходит за 1-3 сек, рендерится сразу.
// card (полная аналитика) догоняет за 5-15 сек — до этого analytics zone
// показывает skeleton. Если есть только fastCard — рендерим compact-view.
function AdviceCard({
  card,
  fastCard,
  analyzePhase,
}: {
  card: AssistantCard | null;
  fastCard: FastCardShape | null;
  analyzePhase: 'idle' | 'fast' | 'full' | 'error';
}) {
  // Hotfix 2026-05-15 — приоритезация фикснута. Раньше `fastCard ?? card`
  // оставлял fast-ответ навсегда поверх card даже после успешного полного
  // ответа. Теперь: если есть свежий card — берём mainQuestion из него.
  // fastCard используется как «опережающий» рендер только пока card=null.
  // Дополнительно: runAnalyze() сейчас setFastCard(null) после успеха full,
  // так что эта проверка — defense-in-depth.
  const action = card
    ? {
        mainQuestion: card.mainQuestion,
        backupQuestions: card.backupQuestions,
        selfSaleQuestions: card.selfSaleQuestions,
        spinStage: card.spinStage,
        provider: card.provider,
        model: card.model,
        fellBackToMock: card.fellBackToMock,
        promptSource: card.promptSource,
        promptTemplateId: card.promptTemplateId,
      }
    : fastCard;
  if (!action) return null;

  return (
    <Card padded accent={card?.tone === 'CLOSE' ? 'zapusk' : 'ai'}>
      {/* HEADER: SPIN stage · Tone · Engagement · Control · Confidence */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge tone="ai" dot>{STAGE_LABEL[action.spinStage]}</StatusBadge>
          {card && <StatusBadge tone={TONE_TONE[card.tone]} dot>Тон · {TONE_LABEL[card.tone]}</StatusBadge>}
          {card && <StatusBadge tone={CONTROL_TONE[card.dealControlLevel]} dot>{CONTROL_LABEL[card.dealControlLevel]}</StatusBadge>}
          {card && <StatusBadge tone={ENGAGEMENT_TONE[card.engagementSignal]} dot>{ENGAGEMENT_LABEL[card.engagementSignal]}</StatusBadge>}
          {!card && analyzePhase === 'full' && (
            <StatusBadge tone="ai" dot>AI догенерирует аналитику…</StatusBadge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Gauge size={13} className="text-muted" />
          <div className={`text-base font-bold font-num ${(card?.confidence ?? 0) >= 60 ? 'text-success' : (card?.confidence ?? 0) >= 35 ? 'text-zapusk-400' : 'text-warning'}`}>
            {card ? `${card.confidence}%` : '—'}
          </div>
        </div>
      </div>
      <div className="text-[11px] text-muted mb-4">{STAGE_HINT[action.spinStage]}</div>

      {/* Sprint 38 — KB-источники, использованные AI-подсказкой. Бейдж сверху,
          раскрытие snippets — только для admin/manager. Founder видит только
          titles + summary (sensitive content скрыт). */}
      <KnowledgeSourcesBlock sources={card?.usedKnowledgeSources ?? fastCard?.usedKnowledgeSources ?? []} />

      {/* Sprint 34В — ГЛАВНАЯ ЗОНА ДЕЙСТВИЯ. Использует action (fastCard или card).
          Рендерится сразу после ultra-fast этапа — фаундер получает реплику
          через 1-3 секунды, не дожидаясь полной аналитики. */}
      <div className="rounded-lg border border-ai/30 bg-ai/4 px-4 py-3">
        <div className="flex items-center gap-1.5 mb-3">
          <Zap size={13} className="text-ai-glow" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-ai-glow font-semibold">
            Что сказать прямо сейчас
          </span>
        </div>

        {/* MAIN QUESTION — flagship live phrase */}
        <div>
          <SectionLabel icon={<MessageSquare size={12} className="text-ai-glow" />}>Главный вопрос сейчас</SectionLabel>
          <blockquote className="bg-canvas border border-ai/30 rounded-md px-4 py-3 text-[14.5px] leading-relaxed text-primary">
            «{action.mainQuestion}»
          </blockquote>
        </div>

        {/* BACKUP QUESTIONS */}
        {action.backupQuestions.length > 0 && (
          <div className="mt-3">
            <SectionLabel icon={<HelpCircle size={12} className="text-muted" />}>
              Запасные вопросы ({action.backupQuestions.length})
            </SectionLabel>
            <ul className="space-y-1.5">
              {action.backupQuestions.map((q, i) => (
                <li key={i} className="text-[13px] text-secondary leading-relaxed border-l-2 border-line pl-3">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SELF-SALE QUESTIONS — separate purple-ish block */}
        {action.selfSaleQuestions.length > 0 && (
          <div className="mt-4 rounded-md border border-ai/30 bg-ai/8 px-3 py-2.5">
            <SectionLabel icon={<Sparkles size={12} className="text-ai-glow" />}>
              Self-sale: пусть он сам себе продаст
            </SectionLabel>
            <ul className="space-y-1">
              {action.selfSaleQuestions.map((q, i) => (
                <li key={i} className="text-[13px] text-primary leading-relaxed">• {q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Sprint 13: EMOTIONAL RISKS — доступно только из полной аналитики. */}
        {card && card.emotionalRisks.length > 0 && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/8 px-3 py-2.5">
            <SectionLabel icon={<HeartCrack size={12} className="text-danger" />}>
              Что может сломать сделку
            </SectionLabel>
            <ul className="space-y-1">
              {card.emotionalRisks.map((line, i) => (
                <li key={i} className="text-[13px] text-primary leading-relaxed">⚠ {line}</li>
              ))}
            </ul>
          </div>
        )}

        {/* WHAT NOT TO DO — из полной аналитики */}
        {card && card.whatNotToDo.length > 0 && (
          <div className="mt-4 rounded-md border border-danger/25 bg-danger/8 px-3 py-2.5">
            <SectionLabel icon={<Ban size={12} className="text-danger" />}>Что НЕ делать сейчас</SectionLabel>
            <ul className="space-y-1">
              {card.whatNotToDo.map((line, i) => (
                <li key={i} className="text-[13px] text-primary leading-relaxed">— {line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sprint 34В — АНАЛИТИКА. Рендерится только после полного этапа (card).
          Пока card=null и analyzePhase='full' (или 'fast') — показываем
          skeleton, чтобы UI не выглядел зависшим. */}
      <div className="mt-5 pt-4 border-t border-hairline">
        <div className="flex items-center gap-1.5 mb-3">
          <Activity size={13} className="text-muted" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted font-semibold">
            Аналитика разговора
          </span>
          {!card && (analyzePhase === 'fast' || analyzePhase === 'full') && (
            <StatusBadge tone="ai" dot>AI анализирует диалог…</StatusBadge>
          )}
        </div>

        {!card && (
          <div className="space-y-2">
            <div className="h-3 rounded bg-elevated/60 animate-pulse" />
            <div className="h-3 rounded bg-elevated/60 animate-pulse w-5/6" />
            <div className="h-3 rounded bg-elevated/60 animate-pulse w-3/4" />
          </div>
        )}

        {card && <Field icon={<Activity size={14} />} label="Что происходит">{card.situation}</Field>}

        {card && (
          <EmotionalLayer card={card} />
        )}

        {/* RISK / MISSED — warning banner if anything is off */}
        {card && card.riskOrMissed && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30">
            <ShieldAlert size={14} className="text-warning mt-0.5 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-warning font-semibold mb-0.5">Что упускаем</div>
              <div className="text-sm text-primary leading-relaxed">{card.riskOrMissed}</div>
            </div>
          </div>
        )}

        {/* OBJECTIVE + DIRECTION — куда ведём (только полная аналитика) */}
        {card && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniBlock icon={<Target size={13} className="text-zapusk-400" />} label="Цель этапа">
              {card.conversationObjective}
            </MiniBlock>
            <MiniBlock icon={<Compass size={13} className="text-ai-glow" />} label="Куда ведём">
              {card.conversationDirection}
            </MiniBlock>
          </div>
        )}

        {/* WHAT TO DO */}
        {card && card.whatToDo.length > 0 && (
          <div className="mt-4">
            <SectionLabel icon={<Zap size={12} className="text-zapusk-400" />}>Что делать</SectionLabel>
            <ul className="space-y-1">
              {card.whatToDo.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-primary leading-relaxed">
                  <ChevronRight size={14} className="text-zapusk-400 mt-0.5 shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* TONE SHIFT GUIDANCE — мост между «что делать» и репликой. */}
        {card && card.toneShiftGuidance && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-ai/8 border border-ai/25">
            <Wand2 size={13} className="text-ai-glow mt-0.5 shrink-0" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-ai-glow font-semibold mb-0.5">Как изменить тон</div>
              <div className="text-sm text-primary leading-relaxed">{card.toneShiftGuidance}</div>
            </div>
          </div>
        )}
      </div>

      {/* MINI-PITCH — only if interest signal already detected */}
      {card && card.miniPitch && (
        <div className="mt-4 rounded-md border border-zapusk/30 bg-zapusk/8 px-3 py-2.5">
          <SectionLabel icon={<Megaphone size={12} className="text-zapusk-400" />}>Мини-питч</SectionLabel>
          <p className="text-sm text-primary leading-relaxed">{card.miniPitch}</p>
        </div>
      )}

      {/* OBJECTION */}
      {card && card.objection && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30">
          <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-warning font-semibold mb-0.5">Возражение</div>
            <div className="text-sm text-primary">{card.objection}</div>
          </div>
        </div>
      )}

      {/* DEAL NEXT STEP */}
      {card && card.dealNextStep && (
        <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-md bg-zapusk/8 border border-zapusk/25">
          <ChevronRight size={14} className="text-zapusk-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-zapusk-400 font-semibold mb-0.5">Следующий шаг сделки</div>
            <div className="text-sm text-primary">{card.dealNextStep}</div>
          </div>
        </div>
      )}

      {/* Sprint 34В — ДОПОЛНИТЕЛЬНО. Карта СПИН видна только после полной аналитики. */}
      {card && (
      <div className="mt-5 pt-4 border-t border-hairline">
        <div className="flex items-center gap-1.5 mb-3">
          <Target size={13} className="text-muted" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted font-semibold">
            Дополнительно
          </span>
        </div>
        <SectionLabel icon={<Target size={12} className="text-muted" />}>
          Карта этапов СПИН — какие этапы ещё открыты
        </SectionLabel>
        <div className="flex items-center gap-1.5">
          {(['S', 'P', 'I', 'N'] as const).map((stage) => {
            const isOpen = card.spinGaps.includes(stage);
            const isCurrent = card.spinStage === stage;
            // Sprint 34Б.3 — русские буквы в карте этапов: С / П / У / Р.
            const ruLetter = stage === 'S' ? 'С' : stage === 'P' ? 'П' : stage === 'I' ? 'У' : 'Р';
            return (
              <div
                key={stage}
                className={`flex-1 text-center text-[11px] font-semibold rounded-md py-1.5 border
                  ${isCurrent
                    ? 'bg-ai/15 border-ai/40 text-ai-glow'
                    : isOpen
                      ? 'bg-warning/10 border-warning/30 text-warning'
                      : 'bg-surface border-line text-muted line-through'}`}
                title={isCurrent ? 'Текущий этап' : isOpen ? 'Этап ещё открыт' : 'Этап закрыт'}
              >
                {ruLetter}
              </div>
            );
          })}
        </div>
      </div>
      )}
    </Card>
  );
}

// Sprint 13: emotional layer. Не очередной список — это «вторая голова»
// карточки. Badges + 2-3 коротких инсайта про психологию сделки.
function EmotionalLayer({ card }: { card: AssistantCard }) {
  const MomentumIcon = card.momentum === 'POSITIVE' ? TrendingUp : card.momentum === 'NEGATIVE' ? TrendingDown : Minus;
  return (
    <div className="mt-4 rounded-md border border-ai/25 bg-grad-ink/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <HeartHandshake size={13} className="text-ai-glow" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-ai-glow font-semibold">
            Эмоциональный слой
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge tone={STATE_TONE[card.investorState]} dot>
            <UserRound size={10} className="mr-1 inline-block -mt-0.5" />
            {STATE_LABEL[card.investorState]}
          </StatusBadge>
          <StatusBadge tone={TEMP_TONE[card.conversationTemperature]} dot>
            <Thermometer size={10} className="mr-1 inline-block -mt-0.5" />
            {TEMP_LABEL[card.conversationTemperature]}
          </StatusBadge>
          <StatusBadge tone={MOMENTUM_TONE[card.momentum]} dot>
            <MomentumIcon size={10} className="mr-1 inline-block -mt-0.5" />
            {MOMENTUM_LABEL[card.momentum]}
          </StatusBadge>
        </div>
      </div>

      <div className="space-y-1.5">
        {card.emotionalState && (
          <div className="flex items-start gap-2 text-[13px] text-primary leading-relaxed">
            <HeartHandshake size={12} className="text-ai-glow mt-1 shrink-0" />
            <span>{card.emotionalState}</span>
          </div>
        )}
        {card.whyBehavior && (
          <div className="flex items-start gap-2 text-[13px] text-secondary leading-relaxed">
            <Brain size={12} className="text-zapusk-400 mt-1 shrink-0" />
            <span><span className="text-muted">Почему: </span>{card.whyBehavior}</span>
          </div>
        )}
        {card.momentumReason && (
          <div className="flex items-start gap-2 text-[12px] text-muted leading-relaxed">
            <MomentumIcon size={11} className="mt-1 shrink-0" />
            <span>{card.momentumReason}</span>
          </div>
        )}
      </div>
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

function MiniBlock({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-surface/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-0.5 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-[13px] text-primary leading-snug">{children}</div>
    </div>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1.5 flex items-center gap-1.5">
      {icon}
      {children}
    </div>
  );
}

// Sprint 38 — бейдж «Подсказка опирается на N кейсов» + раскрываемый список
// source'ов. Founder видит title + sourceType + summary; admin/manager видят
// также text snippet (raw). Snippet null для founder обеспечен на backend'е.
function KnowledgeSourcesBlock({ sources }: { sources: UsedKnowledgeSource[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources || sources.length === 0) return null;
  // Если у первого source есть snippet — значит роль раскрывающая (admin/manager).
  const showSnippets = sources.some((s) => Boolean(s.snippet));
  return (
    <div className="mb-3 rounded-md border border-ai/30 bg-ai/8 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-[12px] text-primary">
          <BookOpen size={13} className="text-ai-glow" />
          <span>
            Подсказка опирается на <span className="font-semibold">{sources.length}</span>{' '}
            {plural(sources.length, 'похожий кейс', 'похожих кейса', 'похожих кейсов')} из базы ZAPUSK
          </span>
        </span>
        <span className="text-[10px] text-muted">{expanded ? 'скрыть' : 'раскрыть'}</span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-2">
          {sources.map((s) => (
            <li key={s.sourceId} className="border-l-2 border-ai/40 pl-3">
              <div className="text-[12.5px] text-primary font-medium">{s.title}</div>
              <div className="text-[10px] uppercase tracking-[0.08em] text-muted mt-0.5">
                {s.sourceType} · {s.scope === 'global' ? 'глобальный' : 'проект'}
              </div>
              {s.summary && <div className="text-[12px] text-secondary mt-1 leading-snug">{s.summary}</div>}
              {showSnippets && s.snippet && (
                <div className="mt-1.5 text-[11.5px] text-muted leading-snug border-l border-line pl-2 whitespace-pre-wrap">
                  {s.snippet.length > 320 ? `${s.snippet.slice(0, 320)}…` : s.snippet}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// Sprint 43 P0.7 — «Зафиксировать результат». 9 кнопок outcome'ов; одна нажата —
// outcome event сохраняется, UI показывает «результат сохранён». Founder/manager
// фиксируют что произошло после AI-подсказки — это первый шаг learning loop.
function OutcomePanel({
  adviceEventId, projectId, investorName,
}: {
  adviceEventId: string;
  projectId: string | null;
  investorName: string | null;
}) {
  const [saved, setSaved] = useState<{ type: OutcomeType; ts: number } | null>(null);
  const [busy, setBusy] = useState<OutcomeType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function record(type: OutcomeType) {
    setBusy(type);
    setError(null);
    try {
      await createOutcome({
        adviceEventId,
        projectId,
        investorName,
        outcomeType: type,
      });
      setSaved({ type, ts: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'outcome_failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padded accent="zapusk" className="mt-4">
      <CardHeader
        title="Зафиксировать результат"
        subtitle="Что произошло после AI-подсказки? Один клик — и команда увидит как материал сработал."
        action={saved
          ? <StatusBadge tone="success" dot>{OUTCOME_LABELS[saved.type]} · сохранено</StatusBadge>
          : null}
      />
      <div className="flex flex-wrap gap-2">
        {OUTCOME_OPTIONS.map((o) => {
          const isSaved = saved?.type === o.value;
          return (
            <Button
              key={o.value}
              size="sm"
              variant={isSaved ? 'primary' : 'secondary'}
              loading={busy === o.value}
              disabled={Boolean(busy && busy !== o.value)}
              onClick={() => record(o.value)}
              title={isSaved ? 'Сохранено — можно перенажать, чтобы создать ещё один outcome' : o.label}
            >
              {o.label}
            </Button>
          );
        })}
      </div>
      {error && (
        <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 flex items-start gap-2 text-xs text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <p className="text-[10px] text-muted mt-2 leading-snug">
        Можно нажать несколько раз подряд — каждый клик создаёт отдельный outcome (например,
        сначала «Запросил документы», потом через неделю «Назначена встреча»).
      </p>
    </Card>
  );
}
