import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Mic, Square, Headphones, AlertTriangle, Sparkles, MessageSquare, Target,
  Activity, ChevronRight, RefreshCw, Save, CheckCircle2, Upload,
  Compass, ShieldAlert, HelpCircle, Megaphone, Ban, Gauge, Zap,
  HeartHandshake, Brain, Thermometer, TrendingUp, TrendingDown, Minus,
  HeartCrack, Wand2, UserRound, BookOpen, BriefcaseBusiness, KanbanSquare,
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
import { completeMeeting, updateMeetingOutcome, type CompleteResult } from '../lib/salesSessions';
import { createOutcome, OUTCOME_OPTIONS, OUTCOME_LABELS, type OutcomeType } from '../lib/assistantOutcomes';
import { newIdempotencyKey } from '../lib/api';
import { startRealtimeTranscription, type RealtimeSession } from '../lib/realtimeTranscription';

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
  contextSignals?: Array<'investor_requests_project_details'>;
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
  contextSignals?: Array<'investor_requests_project_details'>;
}

type SpeechStatus = 'idle' | 'listening' | 'restarting' | 'stopped' | 'mic_error';

// Sprint 50 hotfix — meeting prep mode response. Distinct from AssistantCard:
// this is a PRE-call plan (objective, style, opening questions, pitch script,
// stages), not a "what to say next" reply. Returned by /api/sales-assistant/prepare.
interface MeetingPlan {
  objective: { understand: string; sell: string; outcome: string };
  conversationStyle: {
    tone: 'aggressive' | 'soft' | 'consultative';
    speakOrListen: 'listen_more' | 'lead_more' | 'balanced';
    whenToPitch: string;
  };
  openingQuestions: string[];
  pitchTiming: string;
  pitchScript: string;
  leveragePoints: string[];
  dealbreakers: string[];
  stages: { name: string; goal: string }[];
  provider: string;
  model: string;
  fellBackToMock: boolean;
  promptSource?: 'db' | 'fallback';
  promptTemplateId?: string | null;
  promptVersion?: number | null;
}

type MeetingMode = 'live' | 'plan';

// Sprint 51 — два рабочих стола AI-ассистента.
//   • 'meeting'       — встреча фаундера/менеджера с инвестором (default).
//   • 'qualification' — первичный звонок инвестору по AI-лидам с целью
//     назначить Zoom с экспертом. Backend получает mode + scriptKey и
//     накладывает qualification overlay на sales_gpt system + добавляет
//     соответствующий script block в user prompt.
type AssistantDeskMode = 'meeting' | 'qualification';

type QualificationScriptKey =
  | 'dlfy_vamlyam'
  | 'dlfy_base'
  | 'glavsnab'
  | 'zapusk_base'
  | 'zapusk_after_vamlyam'
  | 'funnel_return'
  | 'generic';

// Sprint 53 Task D — clean titles per spec (em-dash separator, «Универсальный
// сценарий» вместо «Другой проект / вручную»). Это fallback каталог: основной
// источник — backend (admin-driven via /api/sales-assistant/qualification-scripts).
const QUALIFICATION_SCRIPTS: { key: QualificationScriptKey; label: string; hint: string }[] = [
  { key: 'dlfy_vamlyam',         label: 'DLFY — ВамЛям',           hint: 'Лиды с Авито / ВамЛям. Холодные, нужна сразу ценность.' },
  { key: 'dlfy_base',            label: 'DLFY — наша база',        hint: 'Тёплая база Zapusk: были на эфирах, смотрели проекты.' },
  { key: 'glavsnab',             label: 'ГлавСнаб',                hint: 'Маркетплейс стройматериалов: дивиденды, 12 мес минимум.' },
  { key: 'zapusk_base',          label: 'Zapusk — база',           hint: 'База Zapusk без конкретного проекта — подбор по платформе.' },
  { key: 'zapusk_after_vamlyam', label: 'Zapusk — после ВамЛям',   hint: 'Лид уже общался с менеджером ВамЛям — нужно знать контекст.' },
  { key: 'funnel_return',        label: 'Возврат в воронку',       hint: 'Мёртвый лид: ранее не сложилось, продавать платформу не проект.' },
  { key: 'generic',              label: 'Универсальный сценарий',  hint: 'Используем тот контекст, который вы вставили вручную.' },
];

// Sprint 51 — typed assistant session lifecycle. ВСЕ режимы (meeting +
// qualification) проходят через одну state-machine. Это та же логика, что
// и раньше, просто сформулированная явно: добавляем 'starting' между idle
// и listening — окно между кликом «Начать звонок» и моментом когда
// realtime / Web Speech подтвердили захват.
type AssistantSessionState =
  | 'idle'
  | 'prep'
  | 'starting'
  | 'listening'
  | 'stopped'
  | 'completed'
  | 'error';

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

// Sprint 53 — внутренняя методология (SPIN / self-sale) — moat Zapusk AI и
// НЕ должна светиться в UI. Внутренние enum-значения S/P/I/N остаются как
// контракт с backend и AI provider, но в UI всегда показываем человеческие
// формулировки «Этап разговора · ...». Никаких С/П/У/Р, ни слова «SPIN».
const STAGE_LABEL: Record<AssistantCard['spinStage'], string> = {
  S: 'Понимаем контекст',
  P: 'Выявляем задачу',
  I: 'Уточняем важность',
  N: 'Переходим к решению',
};
// Sprint 53 — тон тоже формулируем человечно. «Контроль» оставляем (это
// общеупотребительный термин в переговорах), «закрытие» — тоже понятно.
// «Мягкий» — оставляем, нейтрально.
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
  _phase: 'idle' | 'fast' | 'full' | 'error',
  _hasAnyCard: boolean,
): string {
  // Sprint 50 hotfix — single canonical label. Users were thrown off by the
  // dynamic "Обновить ещё раз" / "Готовлю главный вопрос…" / "AI анализирует…"
  // copy: it suggested the AI was *doing* something even when the click hadn't
  // landed, and "обновить" implied the displayed advice would change in place
  // (it shouldn't, see fastLock below). The button always says "Получить
  // подсказку"; loading is shown via the Button's spinner.
  return 'Получить подсказку';
}

export default function SalesAssistant() {
  const [projects, setProjects] = useState<Project[]>([]);
  const role = getAuth()?.role ?? 'client';
  const [projectId, setProjectId] = useState<string>('');
  // Sprint 52 P0.4 — multi-project context awareness. relatedProjectIds —
  // дополнительные проекты, упомянутые в звонке (сравнение / альтернативы /
  // подбор). Передаются в analyze + complete как массив. Default — пусто,
  // single-project flow не меняется.
  const [relatedProjectIds, setRelatedProjectIds] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Array<{ ts: number; final: boolean; text: string }>>([]);
  const [interim, setInterim] = useState('');
  // Sprint 50 hotfix — manual transcript paste mode. Founder can paste a
  // Zoom Notes / Telegram / voice-memo transcript and run advice on it
  // without ever turning the mic on. If they later DO start listening, the
  // live transcript appends below the manual block — no destructive merge.
  const [manualTranscript, setManualTranscript] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [manualDraft, setManualDraft] = useState('');
  const manualTranscriptRef = useRef('');
  const [card, setCard] = useState<AssistantCard | null>(null);
  // Sprint 50 hotfix — fast and full are now independent pipelines.
  //   • Each click bumps separate request ids (fastRequestIdRef, fullRequestIdRef)
  //     and gets separate AbortControllers (fastAbortRef, fullAbortRef).
  //   • Each pipeline owns its own loading flag (isFastLoading, isFullLoading).
  //   • The button's `loading` prop reads ONLY isFastLoading — once fast lands,
  //     the user can click again to refresh while full is still enriching.
  //   • Old full responses self-discard via fullRequestIdRef stale-check, so a
  //     slow previous full can never overwrite a fresh fast.
  // analyzePhase is derived for legacy read sites — see below.
  type AnalyzePhase = 'idle' | 'fast' | 'full' | 'error';
  const [isFastLoading, setIsFastLoading] = useState(false);
  const [isFullLoading, setIsFullLoading] = useState(false);
  const [fastCard, setFastCard] = useState<FastCardShape | null>(null);
  // Sprint 50 hotfix — meeting prep mode. When the founder has pasted
  // prep context but the mic hasn't been started yet, the first CTA is
  // "Подготовиться ко встрече" (not "Получить подсказку") and the
  // response is a MeetingPlan, not an AssistantCard. After live transcript
  // accumulates, the CTA flips to "Получить подсказку" and the regular
  // live-advice pipeline runs. The plan persists across the transition;
  // the user can switch between tabs (advice ⇄ plan) any time.
  const [meetingPlan, setMeetingPlan] = useState<MeetingPlan | null>(null);
  const [meetingMode, setMeetingMode] = useState<MeetingMode>('live');
  const [isPreparing, setIsPreparing] = useState(false);
  // Sprint 51 — desk mode (meeting | qualification). Default 'meeting' для
  // обратной совместимости — фаундер на встрече видит ровно то, что видел
  // до Sprint 51. Qualification mode переключается явно через таб сверху.
  const [deskMode, setDeskMode] = useState<AssistantDeskMode>('meeting');
  const [scriptKey, setScriptKey] = useState<QualificationScriptKey>('dlfy_vamlyam');
  // Sprint 52 P0.7 — admin-driven scripts. Загружаем list из backend; пока
  // не загрузили / запрос упал — используем hardcoded QUALIFICATION_SCRIPTS.
  const [qualificationCatalog, setQualificationCatalog] = useState(QUALIFICATION_SCRIPTS);
  const [adviceHistory, setAdviceHistory] = useState<AdviceHistoryItem[]>([]);
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>('idle');
  // Sprint 34A: lastAnalyzeAt / aiError для UX обратной связи.
  // Sprint 34В: auto-refresh interval УБРАН — обновление только вручную.
  const [lastAnalyzeAt, setLastAnalyzeAt] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  // Sprint 50 hotfix — analyzePhase is now DERIVED. The pipelines write to
  // isFastLoading / isFullLoading / aiError; this single line reflects the
  // legacy phase enum so existing badges / spinners keep working.
  const analyzePhase: AnalyzePhase = isFastLoading
    ? 'fast'
    : isFullLoading
      ? 'full'
      : aiError
        ? 'error'
        : 'idle';
  // Sprint 49 hotfix 10 — явный meeting state machine. Раньше состояние
  // распределялось между listening / speechStatus / finishing / finishResult,
  // что приводило к рассогласованию: UI оптимистично сбрасывал «Остановить»
  // до того, как backend подтвердит финализацию. Теперь lifecycle:
  //   idle → listening → stopped → finalizing → finalized
  //                                  ↓ on fail
  //                                  finalize_failed (retry possible)
  type MeetingState = 'idle' | 'listening' | 'stopped' | 'finalizing' | 'finalized' | 'finalize_failed';
  const [meetingState, setMeetingState] = useState<MeetingState>('idle');
  const [liveSessionStarted, setLiveSessionStarted] = useState(false);
  // Reentrancy guard: повторные клики «Завершить встречу» не запускают
  // второй запрос пока первый летит. Защита от race + от двойного клика.
  const finishingRef = useRef(false);
  // Sprint 50 P0.1 — один idempotency-key на текущую попытку финализации.
  // Первый клик минтит ключ, ретраи переиспользуют его → backend отдаёт
  // тот же result, дубль не создаётся. Очищается на success / reset.
  const finalizeIdempotencyKeyRef = useRef<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finishResult, setFinishResult] = useState<CompleteResult | null>(null);
  // Sprint 34В legacy alias — оставляем для совместимости с UI кнопкой loading.
  const finishing = meetingState === 'finalizing';
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
  const liveSessionStartedRef = useRef(false);
  const liveStartedAtRef = useRef<number | null>(null);
  const liveSessionIdRef = useRef(0);
  // Sprint 49 — OpenAI Realtime live transcription через WebRTC. Если сессия
  // успешно открывается, srRef остаётся пустым и Web Speech не используется.
  // Если realtime упал (нет ключа / 5xx / WebRTC заблокирован) — фронт
  // переключается на Web Speech как fallback, чтобы транскрипция всё равно
  // работала. Пользователь видит бейдж того, что реально слушает встречу.
  const realtimeRef = useRef<RealtimeSession | null>(null);
  type TranscriptionProvider = 'realtime' | 'web-speech';
  const [transcriptionProvider, setTranscriptionProvider] = useState<TranscriptionProvider | null>(null);
  const [realtimeModel, setRealtimeModel] = useState<string | null>(null);
  // Sprint 50 hotfix — fast and full are independent pipelines.
  //   • Each ref is bumped on every click of its own pipeline.
  //   • Each AbortController is kept so we can cancel that pipeline only.
  //   • Stale-check is per-pipeline: an old full lands → it sees its
  //     fullRequestIdRef has been bumped → it self-discards. New fast is
  //     untouched.
  const fastRequestIdRef = useRef(0);
  const fastAbortRef = useRef<AbortController | null>(null);
  const fullRequestIdRef = useRef(0);
  const fullAbortRef = useRef<AbortController | null>(null);
  const transcriptLinesRef = useRef<Array<{ ts: number; final: boolean; text: string }>>([]);
  // Sprint 49 hotfix 9 — interim в ref'е, чтобы recentContext/fullTranscript
  // могли подмешивать самую свежую (ещё не финализированную) фразу без
  // ре-рендера компонента.
  const interimRef = useRef<string>('');
  const speechStatusRef = useRef<SpeechStatus>('idle');
  const cardRef = useRef<AssistantCard | null>(null);
  // Sprint 50 hotfix — keep a fastCard ref so the full-pipeline error path
  // can decide whether to surface aiError (no fast on screen) or stay silent
  // (fast already gave the founder something to read aloud).
  const fastCardRef = useRef<FastCardShape | null>(null);
  const adviceHistoryRef = useRef<AdviceHistoryItem[]>([]);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  function setLiveSessionActive(active: boolean) {
    liveSessionStartedRef.current = active;
    setLiveSessionStarted(active);
  }

  // Initial project list. Sprint 50 hotfix — default is now "Без проекта"
  // (empty string) instead of auto-picking the first project. Auto-pick made
  // the project selection invisible to users — every meeting silently linked
  // to project[0]. Now the user makes an explicit choice; orphan-finalize
  // (Sprint 49 hotfix 10) handles the no-project case.
  useEffect(() => {
    api.get<{ projects: Project[] }>('/api/projects').then((r) => {
      setProjects(r.projects);
    });
  }, []);

  // Sprint 52 P0.7 — admin-driven qualification scripts. Подгружаем список
  // из backend (PromptTemplate с category='qualification', активные).
  // Если запрос упал или вернул пусто — остаёмся на hardcoded catalog
  // (QUALIFICATION_SCRIPTS), чтобы UX не сломался.
  useEffect(() => {
    type ApiScript = { scriptKey: string; templateKey: string; name: string; description: string | null };
    api.get<{ scripts: ApiScript[] }>('/api/sales-assistant/qualification-scripts')
      .then((r) => {
        if (!Array.isArray(r.scripts) || r.scripts.length === 0) return;
        // Filter to valid keys и mapим в catalog shape.
        const valid = r.scripts.filter((s): s is ApiScript =>
          QUALIFICATION_SCRIPTS.some((h) => h.key === s.scriptKey),
        );
        if (valid.length === 0) return;
        setQualificationCatalog(valid.map((s) => ({
          key: s.scriptKey as QualificationScriptKey,
          label: s.name,
          hint: s.description ?? '',
        })));
      })
      .catch((err) => {
        console.warn('[sales-assistant] qualification-scripts fetch failed, using hardcoded fallback:', err);
      });
  }, []);

  useEffect(() => {
    transcriptLinesRef.current = transcript;
  }, [transcript]);

  // Mirror fastCard state into ref for cross-pipeline introspection.
  useEffect(() => {
    fastCardRef.current = fastCard;
  }, [fastCard]);

  // Sprint 50 hotfix — manual transcript ref so fullTranscript() (called
  // outside React render) can read the latest value without a re-render dep.
  useEffect(() => {
    manualTranscriptRef.current = manualTranscript;
  }, [manualTranscript]);

  useEffect(() => {
    speechStatusRef.current = speechStatus;
  }, [speechStatus]);

  useEffect(() => {
    cardRef.current = card;
  }, [card]);

  useEffect(() => {
    adviceHistoryRef.current = adviceHistory;
  }, [adviceHistory]);

  // Sprint 49 hotfix 9 — синхронизируем interim ref, чтобы transcript payload
  // мог включать самую свежую interim-фразу без перерендера компонента.
  useEffect(() => {
    interimRef.current = interim;
  }, [interim]);

  useEffect(() => () => {
    shouldListenRef.current = false;
    recognitionActiveRef.current = false;
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    try { srRef.current?.stop(); } catch { /* ignore unmount race */ }
    // Sprint 49 — закрываем WebRTC канал при unmount, иначе mic-tracks
    // остаются активными после ухода со страницы.
    if (realtimeRef.current) {
      try { realtimeRef.current.stop(); } catch { /* ignore */ }
      realtimeRef.current = null;
    }
    // Sprint 50 hotfix — abort both pipelines on unmount.
    if (fastAbortRef.current) { try { fastAbortRef.current.abort(); } catch { /* ignore */ } fastAbortRef.current = null; }
    if (fullAbortRef.current) { try { fullAbortRef.current.abort(); } catch { /* ignore */ } fullAbortRef.current = null; }
  }, []);

  // Auto-scroll transcript to bottom on new lines
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, interim]);

  // Sprint 50 hotfix — combined transcript = pasted text (if any) + live
  // final segments. Order matters: manual goes first because it usually
  // represents the conversation that already happened (Zoom Notes, prior
  // call), and the live mic continues from where the founder is now.
  function fullTranscript(): string {
    const live = transcriptLinesRef.current.filter((t) => t.final).map((t) => t.text).join('\n');
    const manual = manualTranscriptRef.current.trim();
    if (manual && live) return `${manual}\n${live}`;
    return manual || live;
  }

  // Sprint 49 hotfix 9 — для AI analyze важна и interim-фраза (то что только
  // что произнёс инвестор и ещё не закоммитилось как final). Без неё AI часто
  // отстаёт на одну реплику и теряет свежий контекст. Дедуп: если interim
  // полностью совпадает с хвостом final transcript — не дублируем.
  function transcriptWithInterim(): string {
    const base = fullTranscript();
    const interimText = interimRef.current?.trim();
    if (!interimText) return base;
    if (base && base.endsWith(interimText)) return base;
    return base ? `${base}\n${interimText}` : interimText;
  }

  function recentContext(): string {
    const text = transcriptWithInterim();
    return text.length > 6_000 ? text.slice(-6_000) : text;
  }

  // Sprint 49 hotfix 7 — sticky card guard. Защита от regression-overwrite:
  // если новый analyze-результат «беднее» текущего (потерял KB sources,
  // откатился по SPIN на 2+ стадии, или вернул generic placeholder
  // mainQuestion), сохраняем те поля из предыдущей карточки, которые ушли.
  // Это убирает race: «AI разобрал Delphi → через 10 сек повторный analyze
  // получил короткий transcript-снимок и вернул generic SPIN-вопрос».
  // Sequence-id (analysisRequestIdRef) уже отсеивает stale fetch'и; этот
  // слой защищает от валидного, но менее богатого ответа.
  const GENERIC_QUESTION_RE = /расскажите.{0,40}интерес|что.{0,5}вас.{0,5}интерес|продолжаем.{0,5}обще|расскажите.{0,40}о.{0,4}себе/i;

  function isCardPoorer(prev: AssistantCard | null, next: AssistantCard): boolean {
    if (!prev) return false;
    const prevSources = prev.usedKnowledgeSources?.length ?? 0;
    const nextSources = next.usedKnowledgeSources?.length ?? 0;
    if (prevSources > 0 && nextSources === 0) return true;
    const stageRank: Record<AssistantCard['spinStage'], number> = { S: 0, P: 1, I: 2, N: 3 };
    if (stageRank[next.spinStage] < stageRank[prev.spinStage] - 1) return true;
    if (GENERIC_QUESTION_RE.test(next.mainQuestion) && !GENERIC_QUESTION_RE.test(prev.mainQuestion)) {
      return true;
    }
    return false;
  }

  // Sprint 50 hotfix — fast-lock for the current advice request.
  // When fast lands first, its mainQuestion + backupQuestions are the live
  // advice the founder is already starting to read aloud. The subsequent
  // full analyze MUST NOT swap that text mid-sentence. The lock is captured
  // per request (analysisRequestIdRef) and consumed by applyCardSticky on
  // the full-phase merge. Next click → new requestId → new lock window.
  interface FastLock { requestId: number; mainQuestion: string; backupQuestions: string[]; }

  // Merge нынешний result с sticky-полями предыдущего. Никогда не
  // перетираем не-пустые KB sources пустыми; в случае «poorer» —
  // также сохраняем mainQuestion + situation от prev, чтобы UI не моргал
  // generic placeholder'ом.
  // Sprint 50 hotfix — additionally, if `fastLock` matches the current
  // request, the merged card adopts the fast mainQuestion + backupQuestions
  // verbatim. Full analyze still fills the remaining 20+ fields
  // (situation, whatToDo, dealNextStep, emotionalRisks, tone, spinStage…).
  function applyCardSticky(next: AssistantCard, myRequestId: number, fastLock: FastLock | null): void {
    const prev = cardRef.current;
    const poorer = isCardPoorer(prev, next);
    let merged: AssistantCard;
    if (poorer && prev) {
      merged = {
        ...next,
        mainQuestion: prev.mainQuestion,
        situation: prev.situation,
        usedKnowledgeSources: (next.usedKnowledgeSources?.length ?? 0) > 0
          ? next.usedKnowledgeSources
          : prev.usedKnowledgeSources,
        miniPitch: next.miniPitch ?? prev.miniPitch,
      };
      console.debug(
        `[sales-assistant/context] requestId=${myRequestId} new card poorer — keeping sticky fields ` +
        `prevSources=${prev.usedKnowledgeSources?.length ?? 0} nextSources=${next.usedKnowledgeSources?.length ?? 0} ` +
        `prevStage=${prev.spinStage} nextStage=${next.spinStage} ` +
        `genericQ=${GENERIC_QUESTION_RE.test(next.mainQuestion)}`,
      );
    } else {
      merged = prev
        ? {
            ...next,
            usedKnowledgeSources: (next.usedKnowledgeSources?.length ?? 0) > 0
              ? next.usedKnowledgeSources
              : prev.usedKnowledgeSources,
          }
        : next;
    }
    // Sprint 50 hotfix — fast-lock override happens AFTER the poorer-merge
    // because the user-visible "current advice" was set by the fast response
    // and must outlive any wobble in the full payload for THIS request.
    if (fastLock && fastLock.requestId === myRequestId) {
      merged = {
        ...merged,
        mainQuestion: fastLock.mainQuestion,
        backupQuestions: fastLock.backupQuestions,
      };
      console.debug(`[sales-assistant/context] requestId=${myRequestId} fast-lock applied (mainQuestion + backupQuestions preserved)`);
    }
    console.debug(
      `[sales-assistant/context] requestId=${myRequestId} commit ` +
      `mergedSources=${merged.usedKnowledgeSources?.length ?? 0} stage=${merged.spinStage}`,
    );
    setCard(merged);
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
  // Sprint 49 hotfix 9 — frontend всегда даёт backend немного больше времени,
  // чтобы поймать его собственный 4xx/5xx с осмысленным reason, а не
  // абортить на 8s раньше serverного guard'а на 8s. Buffer = 3 секунды на
  // network/serialization.
  const FAST_TIMEOUT_MS = 11_000;   // backend guard 8_000 + 3s
  const FULL_TIMEOUT_MS = 28_000;   // backend guard 25_000 + 3s

  function isAbortError(err: unknown): boolean {
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    if (err instanceof Error && /aborted|abort/i.test(err.message)) return true;
    return false;
  }

  // Sprint 49 hotfix 8 — гранулярная классификация analyze-ошибок.
  // Раньше любой fail показывал «Не удалось быстро получить подсказку», и
  // в консоли был один абстрактный warn. Теперь сначала распознаём конкретную
  // причину (timeout / abort / 401 / 403 / 429 / 5xx / network / parse),
  // выбираем UX-сообщение под неё и логируем структурированно. Карточку
  // НЕ сбрасываем — это уже было так, оставляем как явный комментарий.
  type AnalyzeFailureReason =
    | 'timeout'
    | 'aborted'
    | 'unauthenticated'
    | 'workspace_readonly'
    | 'rate_limit'
    | 'guardrail_cost'
    | 'guardrail_quota'
    | 'server_error'
    | 'network'
    | 'parse'
    | 'unknown';

  interface AnalyzeFailure {
    reason: AnalyzeFailureReason;
    status: number | null;
    body: string;
    userMessage: string;
  }

  // Базовая UX-копия. Стараемся не пугать фаундера во время живой встречи —
  // подсказываем, что делать.
  const FAILURE_UX: Record<AnalyzeFailureReason, string> = {
    timeout: 'AI отвечает дольше обычного. Подождите 10 секунд и нажмите «Получить подсказку» ещё раз.',
    aborted: 'Запрос отменён. Нажмите «Получить подсказку» ещё раз.',
    unauthenticated: 'Сессия истекла. Обновите страницу и войдите заново.',
    workspace_readonly: 'Демо-режим: AI-подсказки доступны после активации рабочего кабинета. Свяжитесь с менеджером.',
    rate_limit: 'OpenAI ограничил частоту запросов. Подождите минуту и попробуйте снова.',
    guardrail_cost: 'Дневной лимит AI-затрат исчерпан. Свяжитесь с администратором.',
    guardrail_quota: 'Дневной лимит AI-запросов исчерпан. Свяжитесь с администратором.',
    server_error: 'AI временно недоступен. Транскрипция продолжается. Попробуйте обновить подсказку через минуту.',
    network: 'Нет связи с сервером. Подсказку нельзя обновить, пока подключение не вернётся.',
    parse: 'AI вернул нечитаемый ответ. Попробуйте ещё раз.',
    unknown: 'Не удалось обновить подсказку. Транскрипция продолжается. Попробуйте ещё раз.',
  };

  function classifyAnalyzeError(err: unknown, controller: AbortController): AnalyzeFailure {
    const wasAbort = isAbortError(err) || controller.signal.aborted;
    const raw = err instanceof Error ? err.message : String(err ?? 'unknown');
    // api.ts кладёт `${status} ${statusText}: ${body}` в Error.message.
    const statusMatch = /^(\d{3})\s/.exec(raw);
    const status = statusMatch ? Number(statusMatch[1]) : null;

    if (wasAbort) {
      // Внешний таймер abort'ит при timeout; пользовательский abort выставляет
      // analysisRequestIdRef и до сюда уже не доходит.
      return { reason: 'timeout', status, body: raw, userMessage: FAILURE_UX.timeout };
    }
    if (status === 401) return { reason: 'unauthenticated', status, body: raw, userMessage: FAILURE_UX.unauthenticated };
    if (status === 403 || /workspace_readonly/i.test(raw)) {
      return { reason: 'workspace_readonly', status, body: raw, userMessage: FAILURE_UX.workspace_readonly };
    }
    if (status === 429 || /rate.?limit|too_many_requests/i.test(raw)) {
      return { reason: 'rate_limit', status, body: raw, userMessage: FAILURE_UX.rate_limit };
    }
    if (/cost_limit_exceeded|ai_cost_limit/i.test(raw)) {
      return { reason: 'guardrail_cost', status, body: raw, userMessage: FAILURE_UX.guardrail_cost };
    }
    if (/quota_exceeded|requests_limit/i.test(raw)) {
      return { reason: 'guardrail_quota', status, body: raw, userMessage: FAILURE_UX.guardrail_quota };
    }
    if (status && status >= 500) return { reason: 'server_error', status, body: raw, userMessage: FAILURE_UX.server_error };
    if (/failed to fetch|network|networkerror/i.test(raw)) {
      return { reason: 'network', status, body: raw, userMessage: FAILURE_UX.network };
    }
    if (/unexpected token|json|parse/i.test(raw)) {
      return { reason: 'parse', status, body: raw, userMessage: FAILURE_UX.parse };
    }
    return { reason: 'unknown', status, body: raw, userMessage: FAILURE_UX.unknown };
  }

  // Sprint 50 hotfix — runAnalyze fires FAST and FULL in PARALLEL.
  //
  // FAST is the product: mainQuestion + backupQuestions + selfSaleQuestions.
  // Once it lands the founder can already start speaking; the button becomes
  // clickable again immediately.
  //
  // FULL is BACKGROUND enrichment: situation, risks, tone, SPIN stage,
  // emotional layer, dealNextStep, etc. It NEVER blocks fast. An old full
  // landing after a new click is silently discarded via fullRequestIdRef.
  // Sprint 50 hotfix — meeting prep call. Uses the same manual+live transcript
  // as the analyze pipeline so the user can paste context, prep, then start
  // listening WITHOUT losing the prep context — both flow into the same
  // analyze payload after the live stream starts.
  async function runPrepare() {
    const context = transcriptWithInterim().trim();
    if (context.length < 20) {
      setPermError(deskMode === 'qualification'
        ? 'Вставьте контекст звонка перед подготовкой (минимум 20 символов).'
        : 'Вставьте контекст встречи перед подготовкой (минимум 20 символов).');
      return;
    }
    setIsPreparing(true);
    setAiError(null);
    try {
      const r = await api.post<{ plan: MeetingPlan }>('/api/sales-assistant/prepare', {
        context: context.slice(-32_000),
        projectId: projectId || null,
      });
      setMeetingPlan(r.plan);
      setMeetingMode('plan'); // surface the plan immediately
      setLastAnalyzeAt(Date.now());
      setPermError(null);
      console.debug(
        `[sales-assistant/prepare] done ` +
        `provider=${r.plan.provider} model=${r.plan.model} ` +
        `fellBackToMock=${r.plan.fellBackToMock} ` +
        `promptSource=${r.plan.promptSource ?? '-'} promptVersion=${r.plan.promptVersion ?? '-'} ` +
        `templateId=${r.plan.promptTemplateId ?? '-'} ` +
        `stages=${r.plan.stages.length} openingQs=${r.plan.openingQuestions.length}`,
      );
    } catch (err) {
      const failure = classifyAnalyzeError(err, new AbortController());
      console.warn(`[sales-assistant/prepare] FAIL reason=${failure.reason} status=${failure.status ?? '-'} message="${failure.body.slice(0, 200)}"`);
      setAiError(failure.userMessage);
    } finally {
      setIsPreparing(false);
    }
  }

  async function runAnalyze() {
    // Sprint 49 hotfix 9 — analyze видит final + interim.
    const transcriptText = transcriptWithInterim();
    if (transcriptText.trim().length < 10) {
      setPermError('Сначала начните прослушивание и скажите несколько фраз.');
      return;
    }

    // Cancel any in-flight prior pipelines (both fast and full are
    // independent now). New click → both pipelines reset.
    if (fastAbortRef.current) { try { fastAbortRef.current.abort(); } catch { /* ignore */ } }
    if (fullAbortRef.current) { try { fullAbortRef.current.abort(); } catch { /* ignore */ } }
    const fastCtrl = new AbortController();
    const fullCtrl = new AbortController();
    fastAbortRef.current = fastCtrl;
    fullAbortRef.current = fullCtrl;
    const myFastId = ++fastRequestIdRef.current;
    const myFullId = ++fullRequestIdRef.current;

    setIsFastLoading(true);
    setIsFullLoading(true);
    setAiError(null);

    // Capture inputs once at click time so neither pipeline reads stale state.
    const transcriptForApi = transcriptText.slice(-32_000);
    const previousAdvice = cardRef.current;
    const previousSpinStage = cardRef.current?.spinStage ?? null;
    const adviceHistorySnapshot = adviceHistoryRef.current.slice(-6);
    const startedAt = performance.now();
    // Sprint 50 hotfix — diagnostic surface for repeated-click debugging.
    // Tracks: clickId, manual/live char split, previous mainQuestion (so a
    // later mainQuestionChanged check can fire), and absolute timestamps for
    // each pipeline boundary. No raw transcript in logs — only counts.
    const liveChars = transcriptLinesRef.current.filter((t) => t.final).map((t) => t.text).join('\n').length
      + (interimRef.current?.trim().length ?? 0);
    const manualChars = manualTranscriptRef.current.trim().length;
    const prevMainQuestion = cardRef.current?.mainQuestion ?? fastCardRef.current?.mainQuestion ?? null;
    console.debug(
      `[sales-assistant/click] fastReq=${myFastId} fullReq=${myFullId} ` +
      `manualChars=${manualChars} liveChars=${liveChars} ` +
      `transcriptCharsToApi=${transcriptForApi.length} total=${transcriptText.length} ` +
      `prevMainQuestion="${(prevMainQuestion ?? '').slice(0, 60)}"`,
    );

    // `let` is mutated inside the fast IIFE and read inside the full IIFE.
    // TS doesn't track concurrent closure mutations and narrows the type to
    // `null` from the initializer. The `as` cast preserves the union so
    // both branches type-check at the read sites.
    let fastLockForFullMerge = null as { requestId: number; mainQuestion: string; backupQuestions: string[] } | null;
    let fastHardStopped = false; // set by fast pipeline if it hit a hard-stop reason

    // ── FAST pipeline (priority — never blocked by full) ────────────────
    const fastTimer = window.setTimeout(() => {
      if (myFastId === fastRequestIdRef.current) {
        console.debug(`[sales-assistant] fastReq=${myFastId} timeout ${FAST_TIMEOUT_MS}ms`);
        try { fastCtrl.abort(); } catch { /* ignore */ }
      }
    }, FAST_TIMEOUT_MS);
    const fastPromise = (async () => {
      try {
        const r = await api.post<{ fast: FastCardShape }>(
          '/api/sales-assistant/analyze-fast',
          {
            transcript: transcriptForApi,
            recentContext: recentContext(),
            previousAdvice,
            previousSpinStage,
            adviceHistory: adviceHistorySnapshot,
            projectId: projectId || null,
            // Sprint 51 — desk mode + script catalog key.
            mode: deskMode,
            scriptKey: deskMode === 'qualification' ? scriptKey : null,
            // Sprint 52 P0.4 — multi-project: если выбраны related projects,
            // отправляем как массив. Backend сам fallback'нется на projectId.
            projectIds: relatedProjectIds.length > 0
              ? [projectId, ...relatedProjectIds].filter(Boolean)
              : undefined,
            // Sprint 52 P0.6 — для memory retrieval (по investorName).
            investorName: investorName.trim() || undefined,
          },
          { signal: fastCtrl.signal },
        );
        window.clearTimeout(fastTimer);
        if (myFastId !== fastRequestIdRef.current) {
          console.debug(`[sales-assistant/fast] fastReq=${myFastId} STALE-DISCARD (current=${fastRequestIdRef.current})`);
          return;
        }
        const latencyMs = Math.round(performance.now() - startedAt);
        const mainQuestionChanged = r.fast.mainQuestion !== prevMainQuestion;
        console.debug(
          `[sales-assistant/fast] fastReq=${myFastId} done latencyMs=${latencyMs} ` +
          `spinStage=${r.fast.spinStage} source=${r.fast.source ?? 'ai'} ` +
          `mainQuestionChanged=${mainQuestionChanged} ` +
          `mainQuestion="${(r.fast.mainQuestion ?? '').slice(0, 60)}"`,
        );
        setFastCard(r.fast);
        setLastAnalyzeAt(Date.now());
        setPermError(null);
        // Real AI responses lock the actionable fields; mock/fallback fast
        // doesn't — full (real AI) should be allowed to replace it.
        const fastIsMock = r.fast.fellBackToMock || r.fast.source === 'mock';
        if (!fastIsMock) {
          fastLockForFullMerge = {
            requestId: myFastId,
            mainQuestion: r.fast.mainQuestion,
            backupQuestions: r.fast.backupQuestions,
          };
        }
      } catch (err) {
        window.clearTimeout(fastTimer);
        if (myFastId !== fastRequestIdRef.current) return;
        const failure = classifyAnalyzeError(err, fastCtrl);
        const durationMs = Math.round(performance.now() - startedAt);
        console.warn(
          `[sales-assistant] fastReq=${myFastId} FAIL reason=${failure.reason} ` +
          `status=${failure.status ?? '-'} durationMs=${durationMs} ` +
          `transcriptChars=${transcriptForApi.length} message="${failure.body.slice(0, 200)}"`,
        );
        // Hard-stop reasons (auth / guardrails) — surface error and stop
        // full too. The user can't get past these by waiting.
        const HARD_STOP: AnalyzeFailureReason[] = ['unauthenticated', 'workspace_readonly', 'guardrail_cost', 'guardrail_quota'];
        if (HARD_STOP.includes(failure.reason)) {
          setAiError(failure.userMessage);
          fastHardStopped = true;
          try { fullCtrl.abort(); } catch { /* ignore */ }
        } else {
          // Soft fast failure — full may still rescue. Show a soft message;
          // full pipeline will overwrite if it succeeds.
          setAiError(failure.userMessage);
        }
      } finally {
        if (myFastId === fastRequestIdRef.current) setIsFastLoading(false);
        if (fastAbortRef.current === fastCtrl) fastAbortRef.current = null;
      }
    })();

    // ── FULL pipeline (background enrichment) ───────────────────────────
    const fullTimer = window.setTimeout(() => {
      if (myFullId === fullRequestIdRef.current) {
        console.debug(`[sales-assistant] fullReq=${myFullId} timeout ${FULL_TIMEOUT_MS}ms`);
        try { fullCtrl.abort(); } catch { /* ignore */ }
      }
    }, FULL_TIMEOUT_MS);
    void (async () => {
      try {
        const r = await api.post<{ card: AssistantCard; adviceEventId?: string | null }>(
          '/api/sales-assistant/analyze',
          {
            transcript: transcriptForApi,
            recentContext: recentContext(),
            previousAdvice,
            previousSpinStage,
            adviceHistory: adviceHistorySnapshot,
            projectId: projectId || null,
            // Sprint 51 — desk mode + script catalog key.
            mode: deskMode,
            scriptKey: deskMode === 'qualification' ? scriptKey : null,
            // Sprint 52 P0.4 — multi-project: если выбраны related projects,
            // отправляем как массив. Backend сам fallback'нется на projectId.
            projectIds: relatedProjectIds.length > 0
              ? [projectId, ...relatedProjectIds].filter(Boolean)
              : undefined,
            // Sprint 52 P0.6 — для memory retrieval (по investorName).
            investorName: investorName.trim() || undefined,
          },
          { signal: fullCtrl.signal },
        );
        window.clearTimeout(fullTimer);
        if (myFullId !== fullRequestIdRef.current) {
          console.debug(`[sales-assistant/full] fullReq=${myFullId} STALE-DISCARD (current=${fullRequestIdRef.current})`);
          return;
        }
        // Wait for fast to settle so the lock is set (or known to be null).
        // Fast almost always finishes well before full, so this rarely waits.
        await fastPromise.catch(() => { /* fast error handled in its catch */ });
        if (myFullId !== fullRequestIdRef.current) return;
        if (fastHardStopped) return; // user already sees an error; don't write a card under it
        const latencyMs = Math.round(performance.now() - startedAt);
        // Sprint 50 hotfix — log the value that will actually land on screen
        // after the fastLock override inside applyCardSticky. lockedMQ
        // === fastLockForFullMerge.mainQuestion if click had a non-mock fast;
        // otherwise the raw full mainQuestion.
        const lockedMQ = fastLockForFullMerge
          ? fastLockForFullMerge.mainQuestion
          : (r.card.mainQuestion ?? '');
        const fullMainQuestionChanged = lockedMQ !== prevMainQuestion;
        console.debug(
          `[sales-assistant/full] fullReq=${myFullId} done latencyMs=${latencyMs} ` +
          `spinStage=${r.card?.spinStage ?? '?'} ` +
          `fastLockApplied=${Boolean(fastLockForFullMerge)} ` +
          `mainQuestionChanged=${fullMainQuestionChanged} ` +
          `committedMainQuestion="${lockedMQ.slice(0, 60)}"`,
        );
        // Full = enrichment. fastLock pins mainQuestion + backupQuestions;
        // applyCardSticky preserves KB sources / non-generic main question.
        applyCardSticky(r.card, myFullId, fastLockForFullMerge);
        // Drop the now-redundant fast view; card carries the locked fields.
        setFastCard(null);
        setAdviceHistory((prev) => [...prev, toAdviceHistoryItem(r.card)].slice(-6));
        setLastAnalyzeAt(Date.now());
        // Clear aiError only if fast didn't already register a soft message
        // we want to keep — but full success should reset transient errors.
        setAiError(null);
        if (r.adviceEventId) {
          setAdviceEventLast(r.adviceEventId);
          setAdviceEventIds((prev) => [...prev, r.adviceEventId as string]);
        }
      } catch (err) {
        window.clearTimeout(fullTimer);
        if (myFullId !== fullRequestIdRef.current) return;
        const failure = classifyAnalyzeError(err, fullCtrl);
        const durationMs = Math.round(performance.now() - startedAt);
        console.warn(
          `[sales-assistant] fullReq=${myFullId} FAIL reason=${failure.reason} ` +
          `status=${failure.status ?? '-'} durationMs=${durationMs} ` +
          `transcriptChars=${transcriptForApi.length} message="${failure.body.slice(0, 200)}"`,
        );
        // If fast gave the user something to read, full's failure is purely
        // a missed enrichment — don't pollute UI with an error in that case.
        const fastDelivered = Boolean(fastLockForFullMerge) || Boolean(fastCardRef.current);
        if (!fastDelivered) {
          const fullMsg = failure.reason === 'timeout'
            ? 'Полный разбор не успел обновиться, можно повторить.'
            : failure.reason === 'unknown' || failure.reason === 'server_error'
              ? 'Аналитика временно недоступна. Попробуйте обновить подсказку.'
              : failure.userMessage;
          setAiError(fullMsg);
        }
      } finally {
        if (myFullId === fullRequestIdRef.current) setIsFullLoading(false);
        if (fullAbortRef.current === fullCtrl) fullAbortRef.current = null;
      }
    })();
  }

  function startRecognition() {
    if (recognitionActiveRef.current || srRef.current) return;
    const SR = getSR();
    const recognitionSessionId = liveSessionIdRef.current;
    if (!SR) {
      shouldListenRef.current = false;
      setLiveSessionActive(false);
      liveStartedAtRef.current = null;
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
        if (
          !shouldListenRef.current ||
          !liveSessionStartedRef.current ||
          recognitionSessionId !== liveSessionIdRef.current
        ) return;
        if (final.length) setTranscript((prev) => [...prev, ...final]);
        setInterim(interimText);
      };
      sr.onerror = (e) => {
        if (recognitionSessionId !== liveSessionIdRef.current) return;
        const code = (e as { error?: string }).error ?? '';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          shouldListenRef.current = false;
          setLiveSessionActive(false);
          liveStartedAtRef.current = null;
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
          setLiveSessionActive(false);
          liveStartedAtRef.current = null;
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
        if (recognitionSessionId !== liveSessionIdRef.current) return;
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
      setLiveSessionActive(false);
      liveStartedAtRef.current = null;
      setListening(false);
      srRef.current = null;
      recognitionActiveRef.current = false;
      speechStatusRef.current = 'mic_error';
      setSpeechStatus('mic_error');
      setPermError(err instanceof Error ? err.message : 'Не удалось включить распознавание речи');
    }
  }

  async function start() {
    shouldListenRef.current = true;
    setPermError(null);
    const currentLiveSessionId = liveSessionIdRef.current + 1;
    liveSessionIdRef.current = currentLiveSessionId;
    setLiveSessionActive(true);
    liveStartedAtRef.current = Date.now();
    setInterim('');
    interimRef.current = '';
    setMeetingState('listening');
    setFinalizeError(null);
    if (!startedAtRef.current) startedAtRef.current = new Date().toISOString();
    // Sprint 49 — primary path: OpenAI Realtime через WebRTC. Если бэкенд
    // не выдаёт ephemeral token (нет API key / нет шаблона) или WebRTC
    // не доступен — переключаемся на резервный Web Speech API. Пользователь
    // не остаётся без транскрипции при сбое.
    try {
      const session = await startRealtimeTranscription({
        onInterim: (text) => {
          if (
            !shouldListenRef.current ||
            !liveSessionStartedRef.current ||
            currentLiveSessionId !== liveSessionIdRef.current
          ) return;
          setInterim(text);
        },
        onFinal: (text) => {
          if (
            !shouldListenRef.current ||
            !liveSessionStartedRef.current ||
            currentLiveSessionId !== liveSessionIdRef.current
          ) return;
          setTranscript((prev) => [...prev, { ts: Date.now(), final: true, text }]);
          setInterim('');
        },
        onError: (err) => {
          console.warn('[sales-assistant] realtime error, falling back to web-speech:', err.message);
          try { realtimeRef.current?.stop(); } catch { /* ignore */ }
          realtimeRef.current = null;
          if (!shouldListenRef.current) return;
          setTranscriptionProvider('web-speech');
          setRealtimeModel(null);
          startRecognition();
        },
        onClose: () => {
          // Закрытие со стороны OpenAI — сбрасываем provider только если
          // пользователь всё ещё в режиме listening и нет fallback'а.
          if (shouldListenRef.current && !srRef.current) {
            setListening(false);
            setSpeechStatus('stopped');
            speechStatusRef.current = 'stopped';
          }
        },
      });
      realtimeRef.current = session;
      setTranscriptionProvider('realtime');
      setRealtimeModel(session.info.model);
      setListening(true);
      speechStatusRef.current = 'listening';
      setSpeechStatus('listening');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.warn('[sales-assistant] realtime unavailable, falling back to web-speech:', msg);
      setTranscriptionProvider('web-speech');
      setRealtimeModel(null);
      startRecognition();
    }
    // Sprint 34В — auto-refresh ОТКЛЮЧЁН. Транскрипция и AI-подсказка теперь
    // два независимых процесса:
    //   • Транскрипция идёт сама непрерывно (Realtime / Web Speech restart loop)
    //   • AI-подсказка обновляется ТОЛЬКО по кнопке «Обновить подсказку»
    // Пользователь сам управляет моментом анализа.
  }

  // Sprint 49 hotfix 10 — финализация встречи с idempotency, state machine
  // и понятной ошибкой. Ключевые изменения:
  //   • finishingRef защищает от повторного клика во время запроса;
  //   • если встреча уже finalized — повторный клик не отправляет ничего;
  //   • НЕ останавливаем listening / не сбрасываем UI до успеха backend;
  //   • при ошибке state переходит в finalize_failed, transcript и card
  //     сохраняются, пользователь может ретраить;
  //   • backend больше не требует projectId → orphan-finalize работает.
  async function finishMeeting() {
    if (finishingRef.current) return; // уже летит запрос
    if (meetingState === 'finalized') return; // уже сохранили
    const transcriptText = fullTranscript();
    if (transcriptText.trim().length < 10) {
      setPermError(labels.finalizeTooShort);
      return;
    }
    finishingRef.current = true;
    setFinalizeError(null);
    setMeetingState('finalizing');
    // Sprint 50 P0.1 — переиспользуем ключ между ретраями той же встречи.
    // Mintим на первый клик, не трогаем потом до закрытия модала / reset.
    if (!finalizeIdempotencyKeyRef.current) {
      finalizeIdempotencyKeyRef.current = newIdempotencyKey();
    }
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
        // Sprint 52 P0.4 — multi-project. Передаём массив [primary, ...related].
        projectIds: relatedProjectIds.length > 0
          ? [projectId, ...relatedProjectIds].filter(Boolean)
          : undefined,
      }, finalizeIdempotencyKeyRef.current);
      // Только после успеха останавливаем listening и переходим в finalized.
      setFinishResult(result);
      setMeetingState('finalized');
      stop();
    } catch (err) {
      // Не делаем optimistic reset: listening остаётся active (если был),
      // transcript и card на экране. Пользователь либо ретраит, либо
      // продолжает встречу.
      const msg = err instanceof Error ? err.message : 'unknown';
      const friendly = friendlyFinalizeError(msg);
      console.warn(`[sales-assistant] finalize FAIL message="${msg.slice(0, 200)}"`);
      setFinalizeError(friendly);
      setMeetingState('finalize_failed');
    } finally {
      finishingRef.current = false;
    }
  }

  // Sprint 49 hotfix 10 — UX-копия под конкретные ошибки финализации.
  // Никогда не показываем raw 403/500.
  function friendlyFinalizeError(rawMessage: string): string {
    if (/project_required/i.test(rawMessage)) {
      // После hotfix 10 backend больше так не отвечает, но защита остаётся
      // на случай старого сервера.
      return labels.finalizeProjectFallback;
    }
    if (/transcript_too_short/i.test(rawMessage)) {
      return 'Транскрипция слишком короткая. Поговорите ещё минуту и нажмите ещё раз.';
    }
    if (/^401\s|unauthenticated/i.test(rawMessage)) {
      return 'Сессия истекла. Обновите страницу и войдите заново.';
    }
    if (/^403\s/.test(rawMessage)) {
      return 'Нет доступа к этому проекту. Снимите выбор проекта или выберите свой.';
    }
    if (/^429\s|rate.?limit/i.test(rawMessage)) {
      return 'AI ограничил частоту запросов. Подождите минуту и попробуйте ещё раз.';
    }
    if (/^5\d{2}\s|complete_session_failed/i.test(rawMessage)) {
      return labels.finalizeGeneric;
    }
    return labels.finalizeGeneric2;
  }

  function closeFinishModal() {
    setFinishResult(null);
    // Reset transcript so next meeting starts clean. Investor fields keep state
    // — менеджеру обычно нужно проводить серию встреч с одним проектом.
    setTranscript([]);
    setInterim('');
    // Sprint 50 hotfix — manual paste cleared between meetings too.
    setManualTranscript('');
    setIsEditingTranscript(false);
    setManualDraft('');
    setCard(null);
    setAdviceHistory([]);
    startedAtRef.current = null;
    speechStatusRef.current = 'idle';
    setSpeechStatus('idle');
    // Sprint 34В — сброс AI state.
    setLastAnalyzeAt(null);
    setAiError(null);
    setFastCard(null);
    // Sprint 50 hotfix — clear both loading flags + cancel in-flight pipelines.
    setIsFastLoading(false);
    setIsFullLoading(false);
    if (fastAbortRef.current) { try { fastAbortRef.current.abort(); } catch { /* ignore */ } fastAbortRef.current = null; }
    if (fullAbortRef.current) { try { fullAbortRef.current.abort(); } catch { /* ignore */ } fullAbortRef.current = null; }
    // Sprint 49 — следующая встреча заново выбирает provider.
    setTranscriptionProvider(null);
    setRealtimeModel(null);
    // Sprint 49 hotfix 10 — после закрытия модала возвращаемся в idle, чтобы
    // следующая встреча стартовала с чистого state machine.
    setMeetingState('idle');
    liveSessionIdRef.current++;
    setLiveSessionActive(false);
    liveStartedAtRef.current = null;
    setFinalizeError(null);
    // Sprint 50 P0.1 — следующая встреча получит свежий idempotency-key.
    finalizeIdempotencyKeyRef.current = null;
    // Sprint 43 — сброс advice tracking при новом meeting'е.
    setAdviceEventIds([]);
    setAdviceEventLast(null);
    // Sprint 52 P0.4 — сброс related-projects при новом звонке.
    setRelatedProjectIds([]);
  }

  function stop() {
    shouldListenRef.current = false;
    liveSessionIdRef.current++;
    // Hotfix — preserve liveSessionStarted=true if the founder already
    // captured a live transcript. Without this, clicking «Остановить»
    // after a real conversation flips CTA back to «Подготовиться ко
    // встрече», which is wrong: the meeting happened, the founder still
    // needs «Получить подсказку» to refresh advice on what was said.
    // Only fully reset if no live transcript was captured at all.
    const liveTranscriptExists =
      transcriptLinesRef.current.some((t) => t.final && t.text.trim().length > 0);
    if (!liveTranscriptExists) {
      setLiveSessionActive(false);
    }
    liveStartedAtRef.current = null;
    setListening(false);
    speechStatusRef.current = 'stopped';
    setSpeechStatus('stopped');
    // Sprint 49 hotfix 10 — обновляем meeting state только если мы НЕ в
    // активном finalize / finalized. finishMeeting() сам вызывает stop()
    // после успеха и до этого момента уже выставил 'finalized'.
    setMeetingState((prev) =>
      prev === 'finalizing' || prev === 'finalized' || prev === 'finalize_failed' ? prev : 'stopped',
    );
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    try { srRef.current?.stop(); } catch { /* ignore */ }
    srRef.current = null;
    recognitionActiveRef.current = false;
    // Sprint 49 — закрываем WebRTC канал; mic-track release происходит внутри
    // realtimeRef.stop(). Без этого индикатор записи в браузере остаётся
    // включённым после нажатия «Остановить».
    if (realtimeRef.current) {
      try { realtimeRef.current.stop(); } catch { /* ignore */ }
      realtimeRef.current = null;
    }
    setInterim('');
  }

  function reset() {
    setTranscript([]);
    setInterim('');
    // Sprint 50 hotfix — reset also clears manual paste, per user spec.
    setManualTranscript('');
    setIsEditingTranscript(false);
    setManualDraft('');
    setCard(null);
    setAdviceHistory([]);
    speechStatusRef.current = 'idle';
    setSpeechStatus('idle');
    setPermError(null);
    // Sprint 49 hotfix 10 — после ручного reset возвращаемся в idle. Если
    // финализация была finalize_failed, тоже сбрасываем — пользователь
    // решил начать с чистого листа.
    setMeetingState('idle');
    liveSessionIdRef.current++;
    setLiveSessionActive(false);
    liveStartedAtRef.current = null;
    setFinalizeError(null);
    // Sprint 50 P0.1 — сброс idempotency key (новая встреча → новый key).
    finalizeIdempotencyKeyRef.current = null;
    // Sprint 49 — сброс provider state, чтобы следующий start() заново выбрал
    // realtime vs web-speech по текущей доступности backend.
    setTranscriptionProvider(null);
    setRealtimeModel(null);
    // Sprint 34В — сброс AI state.
    setLastAnalyzeAt(null);
    setAiError(null);
    setFastCard(null);
    // Sprint 50 hotfix — clear both loading flags + cancel in-flight pipelines.
    setIsFastLoading(false);
    setIsFullLoading(false);
    if (fastAbortRef.current) { try { fastAbortRef.current.abort(); } catch { /* ignore */ } fastAbortRef.current = null; }
    if (fullAbortRef.current) { try { fullAbortRef.current.abort(); } catch { /* ignore */ } fullAbortRef.current = null; }
    fastRequestIdRef.current++;
    fullRequestIdRef.current++;
  }

  const wordCount = useMemo(
    () => transcript.filter((t) => t.final).reduce((acc, t) => acc + t.text.split(/\s+/).length, 0),
    [transcript],
  );
  // Sprint 50 hotfix — manual transcript also satisfies the "we have
  // something to analyze" gate. Require ≥10 chars on manual to avoid
  // a trivially-pasted "test" enabling the button.
  const hasFinalTranscript = transcript.some((t) => t.final) || manualTranscript.trim().length >= 10;
  // Sprint 50 hotfix — prep mode: manual context present, but the live
  // meeting has not been started yet. The moment the user clicks
  // «Начать прослушивание» (or any path that sets liveSessionStarted /
  // meetingState='listening' / listening=true), prep mode flips off and
  // the main CTA becomes «Получить подсказку» — even if the founder is
  // still silent and no transcript chars have arrived yet.
  //
  // isLiveSessionActive is the SINGLE truth source: any of three signals
  // means "the live meeting has started". Don't gate on hasLiveTranscript:
  // a silent first 10 seconds must still show «Получить подсказку», not
  // «Подготовиться ко встрече», otherwise the founder can't get an
  // opening question until they speak first — exactly backwards.
  const isLiveSessionActive =
    liveSessionStarted ||
    meetingState === 'listening' ||
    listening;
  const hasMeaningfulPrepContext = manualTranscript.trim().length >= 20;
  const inPrepMode = hasMeaningfulPrepContext && !isLiveSessionActive;
  const visibleProjects = useMemo(
    () => projects.filter((p) => role !== 'FOUNDER' || !isLegacyDemoProject(p)),
    [role, projects],
  );

  // Sprint 34В — отдельные статусы транскрипции и AI-подсказки.
  // Транскрипция идёт непрерывно; подсказка обновляется ТОЛЬКО по кнопке.
  // Sprint 51 hotfix P0.3 — title зависит от deskMode (звонок vs встреча).
  // Для idle / stopped используем общую формулировку.
  const isQual = deskMode === 'qualification';
  const statusText: Record<SpeechStatus, { title: string; hint: string }> = {
    idle: {
      title: 'Готов к старту',
      hint: isQual
        ? 'Нажмите «Начать звонок» и разрешите доступ к микрофону.'
        : 'Нажмите «Начать прослушивание» и разрешите доступ к микрофону.',
    },
    listening: {
      title: isQual ? 'Слушаю звонок' : 'Слушаю встречу',
      hint: 'Говорите естественно. Паузы не сбрасывают транскрипцию. Подсказку обновите по кнопке, когда нужно.',
    },
    // Sprint 34A/В — restarting рендерится так же, без отдельного title.
    restarting: {
      title: isQual ? 'Слушаю звонок' : 'Слушаю встречу',
      hint: 'Пауза в речи, продолжаю слушать. Транскрипция не прерывается.',
    },
    stopped: {
      title: 'Остановлено пользователем',
      hint: isQual
        ? 'Можно продолжить звонок или сбросить текущую транскрипцию.'
        : 'Можно продолжить встречу или сбросить текущую транскрипцию.',
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
  // Sprint 51 hotfix P0.1 — раньше layout привязывался к isLiveSessionActive,
  // которое прошлый CTA-fix сохранял true после Stop (если был транскрипт) —
  // чтобы кнопка «Получить подсказку» не откатывалась к «Подготовиться». Но
  // тот же флаг управлял Stop/Start toggle: layout оставался в live-режиме,
  // Stop-кнопка не пропадала, второй клик не давал визуальной реакции →
  // пользователь репортит «Stop не работает».
  //
  // Решение: разделить два решения.
  //   • isLiveSessionActive — «было ли когда-то нажато Start» → используется
  //     только в inPrepMode/CTA-логике («Получить подсказку» vs «Подготовиться»).
  //   • isMicCapturing — «прямо сейчас идёт захват аудио» → используется
  //     для рендера Stop vs Start кнопки и live-layout. После Stop этот флаг
  //     гарантированно становится false, даже если транскрипт сохранён.
  const isMicCapturing = listening || meetingState === 'listening';
  const isLiveMeetingLayout = isMicCapturing;
  const showPreparationBlocks = !isLiveMeetingLayout;
  const actionButtonClass = 'w-full sm:w-auto min-w-0 sm:min-w-[132px] lg:min-w-[168px] whitespace-nowrap';
  // Sprint 51 — лейблы CTA меняются по deskMode. Логика рендера не
  // дублируется: одна и та же кнопка показывает «Начать прослушивание»
  // на встрече и «Начать звонок» в qualification.
  // Sprint 51 hotfix P0.3 — единая словарная разметка под deskMode. В meeting
  // mode тексты остаются прежними («встреча», «прослушивание»); в qualification
  // mode заменяются на «звонок». Это устраняет смешение терминов внутри
  // одного режима.
  const labels = deskMode === 'qualification'
    ? {
        deskHeader: 'Квалификация инвестора',
        deskSubtitle: 'Помогает менеджеру провести первичный звонок и назначить встречу с экспертом',
        liveHeader: 'Живой звонок',
        startLong: 'Начать звонок',
        startShort: 'Начать',
        stop: 'Остановить',
        prepLong: 'Подготовиться к звонку',
        prepShort: 'Подготовиться',
        finishLong: 'Завершить звонок',
        finishShort: 'Завершить',
        finishedLong: 'Звонок сохранён',
        finishedShort: 'Сохранён',
        pasteCtxLong: 'Вставить контекст звонка',
        ctxAddedBadge: 'Контекст звонка добавлен',
        ctxPlaceholder: 'Вставьте контекст звонка: данные лида (Авито, ВамЛям, Telegram), переписку, цель, чек. Система подготовит план звонка и первые вопросы.',
        ctxHelpPreCall: 'Добавьте контекст инвестора и сценария перед звонком',
        ctxHelpPreCallLong: 'Добавьте контекст инвестора, проекта или предыдущего общения — AI подготовит структуру звонка и первые вопросы.',
        listeningTitle: 'Слушаю звонок',
        listeningHintFirst: 'Слушаю звонок. Первые фразы появятся здесь.',
        projectHeader: 'Проект для звонка',
        projectHint: 'AI использует контекст проекта в подсказках. Можно оставить «Без проекта» — звонок сохранится отдельно.',
        projectEmptyOption: 'Без проекта (отдельная сессия)',
        projectEmptyHint: 'У вас пока нет проектов. Сессия будет сохранена без привязки — можно завести проект позже.',
        investorFieldsHint: 'Эти поля попадут в карточку звонка. Можно оставить пустыми — система сохранит «инвестор без имени».',
        planTabLabel: 'План звонка',
        planTabTooltipNeedPrep: 'Сначала «Подготовиться к звонку»',
        planTabTooltipOpen: 'Открыть план звонка',
        prepStep2Title: 'Живой звонок + подсказки',
        prepStep2Text: 'Транскрипция и ручное обновление подсказок',
        engineBadge: 'слушаю звонок',
        finalizeTooShort: 'Слишком короткий звонок. Дайте AI хотя бы пару фраз для анализа.',
        finalizeProjectFallback: 'Звонок сохранён без привязки к проекту. Попробуйте ещё раз.',
        finalizeGeneric: 'Не удалось сохранить звонок. Транскрипция и подсказки сохранены на экране, попробуйте ещё раз.',
        finalizeGeneric2: 'Не удалось завершить звонок. Транскрипция и подсказки сохранены, попробуйте ещё раз.',
      }
    : {
        deskHeader: 'Живая встреча',
        deskSubtitle: isLiveMeetingLayout
          ? 'Транскрипция и подсказка ниже.'
          : 'Подготовьте план или начните разговор.',
        liveHeader: 'Живая встреча',
        startLong: 'Начать прослушивание',
        startShort: 'Начать',
        stop: 'Остановить',
        prepLong: 'Подготовиться ко встрече',
        prepShort: 'Подготовиться',
        finishLong: 'Завершить встречу',
        finishShort: 'Завершить',
        finishedLong: 'Встреча сохранена',
        finishedShort: 'Сохранена',
        pasteCtxLong: 'Вставить контекст встречи',
        ctxAddedBadge: 'Контекст встречи добавлен',
        ctxPlaceholder: 'Вставьте контекст встречи: переписку, заметки, описание проекта или расшифровку разговора. Система подготовит план встречи и первые вопросы.',
        ctxHelpPreCall: 'Добавьте контекст инвестора или проекта перед встречей',
        ctxHelpPreCallLong: 'Добавьте контекст инвестора, проекта или предыдущего общения — ИИ подготовит структуру встречи и первые вопросы.',
        listeningTitle: 'Слушаю встречу',
        listeningHintFirst: 'Слушаю встречу. Первые фразы появятся здесь.',
        projectHeader: 'Проект для этой встречи',
        projectHint: 'AI использует контекст проекта в подсказках. Можно оставить «Без проекта» — встреча сохранится отдельно.',
        projectEmptyOption: 'Без проекта (отдельная встреча)',
        projectEmptyHint: 'У вас пока нет проектов. Встреча будет сохранена без привязки — можно завести проект позже.',
        investorFieldsHint: 'Эти поля попадут в карточку встречи. Можно оставить пустыми — система сохранит «инвестор без имени».',
        planTabLabel: 'План встречи',
        planTabTooltipNeedPrep: 'Сначала «Подготовиться ко встрече»',
        planTabTooltipOpen: 'Открыть план встречи',
        prepStep2Title: 'Живая встреча + подсказки',
        prepStep2Text: 'Транскрипция и ручное обновление подсказок',
        engineBadge: 'слушаю встречу',
        finalizeTooShort: 'Слишком короткая встреча. Дайте AI хотя бы пару фраз для анализа.',
        finalizeProjectFallback: 'Встреча сохранена без привязки к проекту. Попробуйте ещё раз.',
        finalizeGeneric: 'Не удалось сохранить встречу. Транскрипция и подсказки сохранены на экране, попробуйте ещё раз.',
        finalizeGeneric2: 'Не удалось завершить встречу. Транскрипция и подсказки сохранены, попробуйте ещё раз.',
      };

  return (
    <AppLayout
      title="AI-ассистент"
    >
      {/* Sprint 51 — десковый переключатель «Проведение встречи» vs
          «Квалификация инвестора». Default — meeting (без регрессии).
          Disabled-state переключения во время активной сессии:
          переключаться можно только когда не listening. */}
      <Card padded className="mb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Sprint 51 hotfix P0.2 — active vs disabled visual должны быть
              различимыми. Активный таб всегда: bg-grad-ai + canvas-text +
              shadow-ai-glow + aria-pressed=true. Disabled (только во время
              захвата аудио) добавляет opacity-50 + cursor-not-allowed; на
              активный таб opacity НЕ накладываем, чтобы он не сливался с
              неактивным. */}
          {/* Sprint 52 P0.5 — mobile-fit. На мобильном (<sm) табы растягиваются
              в w-full с flex-1 (две равные кнопки), на десктопе остаются
              inline-flex с auto-width. Это убирает горизонтальное
              переполнение на iPhone 390px. */}
          <div
            role="tablist"
            aria-label="Режим AI-ассистента"
            className="flex sm:inline-flex w-full sm:w-auto items-center bg-surface border border-line rounded-md p-0.5 text-[11px] sm:text-xs"
          >
            <button
              type="button"
              role="tab"
              aria-pressed={deskMode === 'meeting'}
              className={clsx(
                'flex-1 sm:flex-none px-2 sm:px-3 h-8 rounded font-semibold transition-colors text-center',
                deskMode === 'meeting'
                  ? 'bg-grad-ai text-canvas shadow-ai-glow'
                  : 'text-secondary hover:text-primary',
                isMicCapturing && deskMode !== 'meeting' && 'opacity-50 cursor-not-allowed',
              )}
              onClick={() => !isMicCapturing && setDeskMode('meeting')}
              disabled={isMicCapturing}
              title={isMicCapturing ? 'Остановите захват, чтобы переключить режим' : 'Полноценная встреча с инвестором'}
            >
              <span className="hidden sm:inline">Проведение встречи</span>
              <span className="sm:hidden">Встреча</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-pressed={deskMode === 'qualification'}
              className={clsx(
                'flex-1 sm:flex-none px-2 sm:px-3 h-8 rounded font-semibold transition-colors text-center',
                deskMode === 'qualification'
                  ? 'bg-grad-ai text-canvas shadow-ai-glow'
                  : 'text-secondary hover:text-primary',
                isMicCapturing && deskMode !== 'qualification' && 'opacity-50 cursor-not-allowed',
              )}
              onClick={() => !isMicCapturing && setDeskMode('qualification')}
              disabled={isMicCapturing}
              title={isMicCapturing ? 'Остановите захват, чтобы переключить режим' : 'Первичный звонок инвестору, цель — Zoom с экспертом'}
            >
              <span className="hidden sm:inline">Квалификация инвестора</span>
              <span className="sm:hidden">Квалификация</span>
            </button>
          </div>
          {deskMode === 'qualification' && (
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="quali-script" className="text-secondary whitespace-nowrap">Сценарий:</label>
              <select
                id="quali-script"
                value={scriptKey}
                onChange={(e) => setScriptKey(e.target.value as QualificationScriptKey)}
                disabled={isMicCapturing}
                className="bg-elevated border border-line text-primary rounded-md px-2 h-8 text-xs disabled:opacity-50"
                title={qualificationCatalog.find((s) => s.key === scriptKey)?.hint ?? ''}
              >
                {qualificationCatalog.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Card>

      <Card padded className="mb-6">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-primary">
              {labels.deskHeader}
            </div>
            <div className="hidden sm:block text-xs text-muted">
              {deskMode === 'qualification'
                ? labels.deskSubtitle
                : (isLiveMeetingLayout
                  ? 'Транскрипция и подсказка ниже.'
                  : 'Подготовьте план или начните разговор.')}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap xl:flex-nowrap gap-2 w-full xl:w-auto">
            <Link to="/conversation-analysis" className="min-w-0">
              <Button
                variant="secondary"
                size="md"
                iconLeft={<Upload size={14} />}
                title="Загрузить запись разговора для AI-разбора"
                className={actionButtonClass}
              >
                <span className="hidden lg:inline">Загрузить запись</span>
                <span className="lg:hidden">Запись</span>
              </Button>
            </Link>
            {isLiveMeetingLayout ? (
              <Button variant="danger" iconLeft={<Square size={14} />} onClick={stop} className={actionButtonClass}>
                {labels.stop}
              </Button>
            ) : (
              <Button variant="primary" iconLeft={<Mic size={14} />} onClick={start} className={actionButtonClass}>
                <span className="hidden lg:inline">{labels.startLong}</span>
                <span className="lg:hidden">{labels.startShort}</span>
              </Button>
            )}
            {inPrepMode ? (
              <Button
                variant="ai"
                iconLeft={<Sparkles size={14} />}
                onClick={() => runPrepare()}
                disabled={!hasMeaningfulPrepContext}
                loading={isPreparing}
                className={clsx(actionButtonClass, 'shadow-ai-glow')}
              >
                <span className="hidden lg:inline">{labels.prepLong}</span>
                <span className="lg:hidden">{labels.prepShort}</span>
              </Button>
            ) : (
              <Button
                variant="ai"
                iconLeft={<RefreshCw size={14} />}
                onClick={() => runAnalyze()}
                disabled={!hasFinalTranscript}
                loading={isFastLoading}
                className={actionButtonClass}
              >
                <span className="hidden lg:inline">{analyzeButtonLabel(analyzePhase, Boolean(card || fastCard))}</span>
                <span className="lg:hidden">Подсказка</span>
              </Button>
            )}
            <Button
              variant="primary"
              iconLeft={<Save size={14} />}
              onClick={finishMeeting}
              loading={finishing}
              disabled={!hasFinalTranscript || meetingState === 'finalized' || meetingState === 'finalizing'}
              title={meetingState === 'finalized' ? 'Сессия уже сохранена' : 'Сохранить транскрипцию и подсказки в карточку'}
              className={actionButtonClass}
            >
              <span className="hidden lg:inline">{meetingState === 'finalized' ? labels.finishedLong : labels.finishLong}</span>
              <span className="lg:hidden">{meetingState === 'finalized' ? labels.finishedShort : labels.finishShort}</span>
            </Button>
            {transcript.length > 0 && !isLiveMeetingLayout && (
              <Button variant="ghost" onClick={reset} className="w-full sm:w-auto whitespace-nowrap">
                Сбросить
              </Button>
            )}
          </div>
        </div>
      </Card>

      {isLiveMeetingLayout && permError && (
        <div className="mb-6 flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-xs text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {permError}
        </div>
      )}
      {isLiveMeetingLayout && finalizeError && meetingState === 'finalize_failed' && (
        <div className="mb-6 flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-xs text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <div>{finalizeError}</div>
            <button
              type="button"
              className="mt-1 underline text-warning hover:text-primary"
              onClick={finishMeeting}
              disabled={finishingRef.current}
            >
              Попробовать ещё раз
            </button>
          </div>
        </div>
      )}

      {/* Status row */}
      {showPreparationBlocks && (
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
              {/* Sprint 49 — какой движок реально слушает встречу. Realtime —
                  OpenAI WebRTC со словарём терминов; web-speech — резервный
                  браузерный путь (Chrome/Edge/Safari) с худшей точностью. */}
              {transcriptionProvider === 'realtime' && (
                <span title={realtimeModel ?? undefined}>
                  <StatusBadge tone="ai" dot>OpenAI Realtime</StatusBadge>
                </span>
              )}
              {transcriptionProvider === 'web-speech' && (
                <StatusBadge tone="warning" dot>резервная браузерная</StatusBadge>
              )}
              {(speechStatus === 'listening' || speechStatus === 'restarting') && (
                <StatusBadge tone="success" dot>{labels.engineBadge}</StatusBadge>
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
        {/* Sprint 49 hotfix 10 — отдельный finalize-error баннер. Не путаем
            с permError (микрофон/проект). Подсветка warning + retry-кнопка. */}
        {finalizeError && meetingState === 'finalize_failed' && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div>{finalizeError}</div>
              <button
                type="button"
                className="mt-1 underline text-warning hover:text-primary"
                onClick={finishMeeting}
                disabled={finishingRef.current}
              >
                Попробовать ещё раз
              </button>
            </div>
          </div>
        )}
      </Card>
      )}

      {/* Sprint 50 hotfix — explicit project picker. Pre-hotfix the project
          selection was a small dropdown in the page header that defaulted
          to the first project; founders kept clicking-through unaware that
          a meeting got silently linked to project[0]. The picker is now a
          labelled section on the page; default is "Без проекта" so the
          user makes an explicit choice. Orphan-finalize (Sprint 49 hotfix 10)
          handles the no-project case end-to-end. */}
      {showPreparationBlocks && (
      <Card padded className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <BriefcaseBusiness size={16} className="text-zapusk-400" />
          <div>
            <div className="text-sm font-semibold text-primary">{labels.projectHeader}</div>
            <div className="text-[11px] text-muted">
              {labels.projectHint}
            </div>
          </div>
        </div>
        <Select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            // Если основной проект изменился — очищаем related, чтобы
            // не было дубля или конфликтов.
            setRelatedProjectIds((prev) => prev.filter((id) => id !== e.target.value));
          }}
          options={[
            { value: '', label: labels.projectEmptyOption },
            ...visibleProjects.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        {visibleProjects.length === 0 && (
          <p className="text-[11px] text-muted mt-2">
            {labels.projectEmptyHint}
          </p>
        )}
        {/* Sprint 52 P0.4 — multi-project related selector. Менеджер /
            фаундер может отметить альтернативные проекты, упоминаемые в
            разговоре (для сравнения / подбора). Foundation под будущий
            auto-detect через mention detection в transcript. */}
        {visibleProjects.length > 1 && (
          <div className="mt-3 pt-3 border-t border-hairline">
            <div className="text-[11px] font-semibold text-secondary mb-1.5">
              Related: упомянуты в разговоре
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visibleProjects
                .filter((p) => p.id !== projectId)
                .map((p) => {
                  const checked = relatedProjectIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setRelatedProjectIds((prev) =>
                          prev.includes(p.id)
                            ? prev.filter((x) => x !== p.id)
                            : [...prev, p.id].slice(0, 4),
                        );
                      }}
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[11px] transition-colors',
                        checked
                          ? 'border-ai/50 bg-ai/15 text-primary'
                          : 'border-line text-secondary hover:border-secondary hover:text-primary',
                      )}
                    >
                      <span className={clsx('w-1.5 h-1.5 rounded-full', checked ? 'bg-ai' : 'bg-muted')} />
                      {p.name}
                    </button>
                  );
                })}
            </div>
            {relatedProjectIds.length >= 4 && (
              <div className="text-[10px] text-muted mt-1">
                Максимум 4 related-проекта (больше шумит подсказку).
              </div>
            )}
          </div>
        )}
      </Card>
      )}

      {/* Investor identification — нужно для Meeting Memory */}
      {showPreparationBlocks && (
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
          {labels.investorFieldsHint}
        </p>
      </Card>
      )}

      {showPreparationBlocks && (
      <Card padded className="mb-6 border-ai/25 bg-ai/8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
          <PrepFlowStep
            step="ЭТАП 1"
            title="Подготовка"
            text={deskMode === 'qualification' ? 'Контекст звонка и план разговора' : 'Контекст встречи и план разговора'}
            active={inPrepMode || meetingMode === 'plan'}
            done={Boolean(meetingPlan)}
          />
          <ChevronRight size={18} className="hidden lg:block text-ai-glow shrink-0" />
          <PrepFlowStep
            step="ЭТАП 2"
            title={labels.prepStep2Title}
            text={labels.prepStep2Text}
            active={listening || meetingMode === 'live'}
            done={Boolean(card || fastCard)}
          />
        </div>
        <p className="mt-3 text-xs text-secondary">
          {deskMode === 'qualification'
            ? 'Сначала подготовьте структуру звонка, затем запускайте живую транскрипцию.'
            : 'Сначала подготовьте структуру встречи, затем запускайте живую транскрипцию.'}
        </p>
      </Card>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6">
        {/* TRANSCRIPT */}
        <Card padded>
          <div className="flex items-start justify-between gap-3 mb-3">
            <CardHeader
              title="Живая транскрипция"
              subtitle={deskMode === 'qualification' ? 'Слева растёт диалог звонка в реальном времени' : 'Слева растёт диалог встречи в реальном времени'}
            />
            {/* Sprint 50 hotfix — manual paste mode. Founders import Zoom Notes /
                Telegram transcripts and run advice without ever turning the
                mic on. Combined with live transcript when both present. */}
            {showPreparationBlocks && !isEditingTranscript && (
              <div className="flex flex-col items-end gap-1.5">
                <Button
                  variant={manualTranscript ? 'secondary' : 'ai'}
                  size="sm"
                  iconLeft={<BookOpen size={13} />}
                  className={clsx(
                    'whitespace-normal text-center leading-tight',
                    !manualTranscript && 'shadow-ai-glow',
                  )}
                  onClick={() => {
                    setManualDraft(manualTranscript);
                    setIsEditingTranscript(true);
                  }}
                >
                  {manualTranscript ? 'Дальше вставить текст' : labels.pasteCtxLong}
                </Button>
                {!manualTranscript && (
                  <span className="max-w-[220px] text-right text-[11px] leading-snug text-muted">
                    {labels.ctxHelpPreCall}
                  </span>
                )}
              </div>
            )}
          </div>

          {showPreparationBlocks && isEditingTranscript ? (
            <div className="space-y-3">
              <textarea
                value={manualDraft}
                onChange={(e) => setManualDraft(e.target.value)}
                placeholder={labels.ctxPlaceholder}
                className="w-full h-[40vh] sm:h-[55vh] bg-canvas border border-hairline rounded-md p-3 text-[13.5px] text-primary leading-relaxed resize-none focus:outline-none focus:border-zapusk/40"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted">{manualDraft.length.toLocaleString('ru-RU')} символов</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setIsEditingTranscript(false); setManualDraft(''); }}
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setManualTranscript(manualDraft.trim());
                      setIsEditingTranscript(false);
                      setPermError(null);
                    }}
                    disabled={manualDraft.trim().length < 10}
                  >
                    Сохранить текст
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {manualTranscript && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone="success" dot>{labels.ctxAddedBadge}</StatusBadge>
                    <StatusBadge tone="info">Текст вставлен вручную</StatusBadge>
                    {isLiveMeetingLayout && (
                      <span className="text-[11px] text-muted">
                        Учитывается в подсказке, но не считается репликой.
                      </span>
                    )}
                  </div>
                  {showPreparationBlocks && (
                    <button
                      type="button"
                      className="text-[11px] text-muted hover:text-primary underline self-start sm:self-auto"
                      onClick={() => {
                        setManualDraft(manualTranscript);
                        setIsEditingTranscript(true);
                      }}
                    >
                      Редактировать
                    </button>
                  )}
                </div>
              )}
              <div
                ref={transcriptRef}
                className="bg-canvas border border-hairline rounded-md p-4 h-[45vh] sm:h-[60vh] overflow-y-auto space-y-2"
              >
                {transcript.length === 0 && !interim && (!manualTranscript || isLiveMeetingLayout) && (
                  <p className="text-sm text-muted text-center py-8">
                    {isLiveMeetingLayout ? labels.listeningHintFirst : labels.ctxHelpPreCallLong}
                  </p>
                )}
                {/* Manual context is not a spoken live segment. Keep the body
                    visible only in preparation mode; during a live meeting
                    the badge above confirms that it is still used by AI. */}
                {manualTranscript && showPreparationBlocks && (
                  <p className="text-[13.5px] text-secondary leading-relaxed whitespace-pre-wrap border-l-2 border-info/40 pl-3">
                    {manualTranscript}
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
            </>
          )}
        </Card>

        {/* AI ADVICE / MEETING PLAN */}
        <div className="space-y-4">
          {/* Sprint 50 hotfix — tab switch between Подсказки (live copilot) and
              План встречи (prep plan). Both views can coexist: prep plan stays
              available even after the mic starts; live advice shows up once
              the user clicks «Получить подсказку». */}
          {(card || fastCard || meetingPlan || inPrepMode) && (
            <div className="inline-flex items-center bg-surface border border-line rounded-md p-0.5 text-xs">
              <button
                type="button"
                className={clsx(
                  'px-3 h-7 rounded font-semibold transition-colors',
                  meetingMode === 'live'
                    ? 'bg-ai/15 text-ai-glow'
                    : 'text-secondary hover:text-primary',
                )}
                onClick={() => setMeetingMode('live')}
              >
                Подсказки
              </button>
              <button
                type="button"
                className={clsx(
                  'px-3 h-7 rounded font-semibold transition-colors',
                  meetingMode === 'plan'
                    ? 'bg-grad-ai text-canvas shadow-ai-glow'
                    : 'text-secondary hover:text-primary',
                  inPrepMode && !meetingPlan && 'border border-ai/30 text-ai-glow',
                  !meetingPlan && 'opacity-40 cursor-not-allowed',
                )}
                onClick={() => meetingPlan && setMeetingMode('plan')}
                disabled={!meetingPlan}
                title={!meetingPlan ? labels.planTabTooltipNeedPrep : labels.planTabTooltipOpen}
              >
                {labels.planTabLabel}
              </button>
            </div>
          )}

          {!card && !fastCard && !meetingPlan && (
            <Card padded className="text-center py-12">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-ai/15 border border-ai/30 flex items-center justify-center text-ai-glow">
                <Sparkles size={18} />
              </div>
              <h3 className="text-base font-semibold text-primary mb-1">
                {inPrepMode
                  ? (deskMode === 'qualification' ? 'Готовы подготовиться к звонку?' : 'Готовы подготовиться к встрече?')
                  : 'Подсказки появятся здесь'}
              </h3>
              <p className="text-xs text-secondary max-w-sm mx-auto">
                {inPrepMode
                  ? labels.ctxHelpPreCallLong
                  : 'Скажите несколько фраз, затем нажмите «Получить подсказку» — ассистент определит этап разговора, тон и предложит следующую реплику.'}
              </p>
            </Card>
          )}

          {/* План встречи (prep mode result) */}
          {meetingMode === 'plan' && meetingPlan && (
            <MeetingPlanCard plan={meetingPlan} title={labels.planTabLabel} />
          )}

          {/* Sprint 34В — fast tactical reply показывается СРАЗУ; полная
              аналитика догоняет в фоне. Если есть только fastCard (этап 2
              ещё в работе) — рендерим compact-карточку без analytics. */}
          {meetingMode === 'live' && (card || fastCard) && (
            <>
              <AdviceCard
                card={card}
                fastCard={fastCard}
                analyzePhase={analyzePhase}
              />
              <div className="flex justify-end">
                <Button
                  variant="ai"
                  iconLeft={<RefreshCw size={14} />}
                  onClick={() => runAnalyze()}
                  disabled={!hasFinalTranscript}
                >
                  {analyzeButtonLabel(analyzePhase, Boolean(card || fastCard))}
                </Button>
              </div>
            </>
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

      {/* Sprint 53 Task F — заголовок и копи модала зависят от deskMode.
          В qualification всё про «звонок», в meeting — про «встречу». */}
      <Modal
        open={finishResult !== null}
        onClose={closeFinishModal}
        title={deskMode === 'qualification' ? 'AI сохранил контекст звонка' : 'AI сохранил контекст встречи'}
        width="max-w-3xl"
      >
        {finishResult && (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-success/10 border border-success/30">
              <CheckCircle2 size={16} className="text-success mt-0.5 shrink-0" />
              <div className="text-sm text-primary">
                {deskMode === 'qualification'
                  ? 'Звонок сохранён в Память встреч. AI учтёт его при следующих контактах с этим инвестором — что зацепило, какие возражения, какой следующий шаг.'
                  : 'Встреча сохранена в Память встреч. Готовы карточка сделки, следующий шаг и продолжение общения — можно отправлять инвестору.'}
              </div>
            </div>
            <MeetingCard session={finishResult.session} />
            {/* Sprint 52 P0.3 — outcome dataset. Менеджер сразу размечает
                результат (либо позже из карточки). Foundation для
                training dataset: successful vs failed vs follow-up. */}
            <OutcomeForm sessionId={finishResult.session.id} deskMode={deskMode} />
            <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
              <Button variant="ghost" onClick={closeFinishModal}>Закрыть</Button>
              <Link to="/meetings">
                <Button variant="secondary">Открыть все встречи</Button>
              </Link>
            </div>
          </div>
        )}
      </Modal>

      {/* Sprint 52 P0.5 — sticky bottom action bar для мобильного.
          Дублирует основные CTA так, чтобы менеджеру на телефоне не нужно
          было скроллить вверх между подсказками. Прячется на sm+ (sm:hidden):
          на десктопе кнопки уже доступны в шапке.

          Z-index 30 — над контентом, но под Modal (Modal обычно z-50+).
          Safe-area-inset-bottom — учитывает home-bar iPhone. */}
      <div
        className="sm:hidden fixed inset-x-0 bottom-0 z-30 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-canvas/95 backdrop-blur border-t border-hairline shadow-[0_-4px_12px_rgba(0,0,0,0.25)]"
      >
        <div className="grid grid-cols-2 gap-2">
          {isLiveMeetingLayout ? (
            <Button
              variant="danger"
              iconLeft={<Square size={14} />}
              onClick={stop}
              className="w-full whitespace-nowrap"
            >
              {labels.stop}
            </Button>
          ) : (
            <Button
              variant="primary"
              iconLeft={<Mic size={14} />}
              onClick={start}
              className="w-full whitespace-nowrap"
            >
              {labels.startShort}
            </Button>
          )}
          {inPrepMode ? (
            <Button
              variant="ai"
              iconLeft={<Sparkles size={14} />}
              onClick={() => runPrepare()}
              disabled={!hasMeaningfulPrepContext}
              loading={isPreparing}
              className="w-full whitespace-nowrap shadow-ai-glow"
            >
              {labels.prepShort}
            </Button>
          ) : (
            <Button
              variant="ai"
              iconLeft={<RefreshCw size={14} />}
              onClick={() => runAnalyze()}
              disabled={!hasFinalTranscript}
              loading={isFastLoading}
              className="w-full whitespace-nowrap"
            >
              Подсказка
            </Button>
          )}
        </div>
      </div>
      {/* Spacer чтобы содержимое не пряталось под sticky bar'ом на мобильном. */}
      <div className="sm:hidden h-20" aria-hidden />
    </AppLayout>
  );
}

// Sprint 52 P0.3 — outcome dataset form. Появляется в успешном
// финализационном modal'е сразу после сохранения встречи. Менеджер может
// разметить результат тут же (без открытия отдельной карточки):
//   • success / failed / followup / unknown
//   • optional manager notes — что сработало / что нет.
// Foundation под training dataset (см. P0.3 spec).
function OutcomeForm({ sessionId, deskMode }: { sessionId: string; deskMode: AssistantDeskMode }) {
  type OutcomeChoice = 'success' | 'failed' | 'followup' | 'unknown';
  const [outcome, setOutcomeState] = useState<OutcomeChoice>('unknown');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sprint 53 Task F — копи под deskMode. В qualification «успех» = Zoom-слот;
  // в meeting «успех» = шаг к сделке. Подсказки помогают менеджеру сразу
  // классифицировать без догадок.
  const sessionWord = deskMode === 'qualification' ? 'звонка' : 'встречи';
  const labels: Record<OutcomeChoice, { dot: string; tone: 'success' | 'danger' | 'warning' | 'info'; label: string; help: string }> = {
    success: {
      dot: 'bg-success',
      tone: 'success',
      label: 'Успех',
      help: deskMode === 'qualification'
        ? 'Zoom-слот с экспертом зафиксирован'
        : 'Шаг к сделке закрыт — следующее касание понятно',
    },
    failed: {
      dot: 'bg-danger',
      tone: 'danger',
      label: 'Не пошло',
      help: deskMode === 'qualification'
        ? 'Слив, отказ, не дозвонились, «не интересно»'
        : 'Отказ, остановка коммуникации',
    },
    followup: {
      dot: 'bg-info',
      tone: 'info',
      label: 'Follow-up',
      help: 'Договорились о повторном касании / нужно подумать',
    },
    unknown: {
      dot: 'bg-muted',
      tone: 'warning',
      label: 'Не размечено',
      help: 'Решу позже — открою из карточки',
    },
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateMeetingOutcome(sessionId, {
        outcome,
        managerOutcomeNotes: notes.trim() || null,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить результат');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-elevated p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-primary mb-1">
          {deskMode === 'qualification' ? 'Итог звонка' : 'Итог встречи'}
        </div>
        <div className="text-[11px] text-muted">
          AI учтёт ваш ответ при следующих контактах с этим инвестором. Можно изменить позже из карточки {sessionWord}.
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(Object.entries(labels) as [OutcomeChoice, typeof labels[OutcomeChoice]][]).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setOutcomeState(key); setSaved(false); }}
            disabled={saving}
            className={clsx(
              'rounded-md border px-2 py-2 text-left text-xs transition-colors',
              outcome === key
                ? 'border-ai/50 bg-ai/10 shadow-ai-glow'
                : 'border-line bg-canvas hover:border-secondary',
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <span className={clsx('w-1.5 h-1.5 rounded-full', meta.dot)} />
              {meta.label}
            </div>
            <div className="text-[10.5px] text-muted mt-0.5 leading-tight">{meta.help}</div>
          </button>
        ))}
      </div>
      <div>
        <label className="text-[11px] text-secondary font-semibold mb-1 block">
          Что сработало / что нет
        </label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
          placeholder={deskMode === 'qualification'
            ? 'Например: «зашёл pitch DLFY x5-x9», «возражение скиньте — отработал через домашку», «инвестор отвалился на чеке».'
            : 'Например: «открытие про команду сработало», «потерял контроль на вопросе по выходу», «получил буду-думать на условия».'}
          className="w-full bg-canvas border border-hairline rounded-md p-2 text-[12.5px] text-primary leading-relaxed resize-none focus:outline-none focus:border-zapusk/40"
          rows={3}
          disabled={saving}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="text-muted">
          {saved && <span className="text-success">Сохранено</span>}
          {error && <span className="text-danger">{error}</span>}
          {!saved && !error && (
            <span>Не обязательно сейчас — можно отметить позже из карточки {sessionWord}.</span>
          )}
        </div>
        <Button variant="ai" size="sm" onClick={save} loading={saving} disabled={saved}>
          {saved ? 'Сохранено' : 'Зафиксировать результат'}
        </Button>
      </div>
    </div>
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
  // Sprint 50 hotfix — actionable fields ALWAYS prefer fastCard when present.
  // Previously (`card > fastCard` globally) the second click's fresh fast was
  // INVISIBLE: card from click N had stale mainQuestion + backupQuestions +
  // selfSaleQuestions, click N+1's setFastCard(newFast) didn't take effect
  // until full landed, and if full silently failed (because "fast was
  // delivered" path), the user kept seeing click N's advice forever.
  //
  // New rule (matches the spec for fast-owned fields):
  //   mainQuestion / backupQuestions / selfSaleQuestions  → fastCard wins
  //   spinStage + metadata (provider / model / promptSource / …) → card wins
  //
  // applyCardSticky already merges fastLock INTO card on full success, so
  // when fastCard is cleared after full lands, card.mainQuestion = the
  // freshest fast value. Continuity is preserved across the fast/full cycle.
  if (!card && !fastCard) return null;
  const action = {
    mainQuestion: fastCard?.mainQuestion ?? card?.mainQuestion ?? '—',
    backupQuestions: fastCard?.backupQuestions ?? card?.backupQuestions ?? [],
    selfSaleQuestions: fastCard?.selfSaleQuestions ?? card?.selfSaleQuestions ?? [],
    spinStage: card?.spinStage ?? fastCard?.spinStage ?? 'S',
    provider: card?.provider ?? fastCard?.provider ?? 'ai',
    model: card?.model ?? fastCard?.model ?? '',
    fellBackToMock: card?.fellBackToMock ?? fastCard?.fellBackToMock ?? false,
    promptSource: card?.promptSource ?? fastCard?.promptSource,
    promptTemplateId: card?.promptTemplateId ?? fastCard?.promptTemplateId,
  };

  return (
    <Card padded accent={card?.tone === 'CLOSE' ? 'zapusk' : 'ai'}>
      {/* HEADER: stage · Tone · Engagement · Control · Confidence
          Sprint 53 — никакого «SPIN» в UI. Бейдж этапа: «Этап разговора · ...» */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge tone="ai" dot>Этап · {STAGE_LABEL[action.spinStage]}</StatusBadge>
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
          через 1-3 секунды, не дожидаясь полной аналитики.
          Sprint 50 hotfix — visual prominence pass. Founder reads this from
          across a Zoom call: brighter border, stronger background contrast,
          mainQuestion bumped to text-lg/leading-loose so it's legible at a
          glance, header reads as the dominant element in the card. */}
      <div className="rounded-xl border-2 border-ai/50 bg-gradient-to-br from-ai/10 to-zapusk/5 px-5 py-4 shadow-ai-glow">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-ai-glow" />
          <h2 className="text-[13px] uppercase tracking-[0.16em] text-ai-glow font-bold">
            Что сказать прямо сейчас
          </h2>
        </div>

        {/* MAIN QUESTION — flagship live phrase. Bumped from text-[14.5px] to
            text-lg + leading-relaxed; quotes around it removed in favour of
            larger sans-serif so it reads like a script line, not a citation. */}
        <div>
          <SectionLabel icon={<MessageSquare size={14} className="text-ai-glow" />}>Главный вопрос сейчас</SectionLabel>
          <blockquote className="bg-canvas border-2 border-ai/40 rounded-lg px-5 py-4 text-lg leading-relaxed text-primary font-medium">
            «{action.mainQuestion}»
          </blockquote>
        </div>

        {/* BACKUP QUESTIONS — bumped 13px → 14px so they're readable beside
            the main question without crowding it. */}
        {action.backupQuestions.length > 0 && (
          <div className="mt-4">
            <SectionLabel icon={<HelpCircle size={13} className="text-muted" />}>
              Запасные вопросы ({action.backupQuestions.length})
            </SectionLabel>
            <ul className="space-y-2">
              {action.backupQuestions.map((q, i) => (
                <li key={i} className="text-[14px] text-secondary leading-relaxed border-l-2 border-ai/30 pl-3">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sprint 53 — внутреннее имя поля (selfSaleQuestions) остаётся
            в JSON-контракте с AI, но user-visible heading нейтральное:
            «Вопросы для раскрытия интереса». Никакой методологии в UI. */}
        {action.selfSaleQuestions.length > 0 && (
          <div className="mt-4 rounded-lg border border-ai/40 bg-ai/12 px-4 py-3">
            <SectionLabel icon={<Sparkles size={13} className="text-ai-glow" />}>
              Вопросы для раскрытия интереса
            </SectionLabel>
            <ul className="space-y-1.5">
              {action.selfSaleQuestions.map((q, i) => (
                <li key={i} className="text-[14px] text-primary leading-relaxed">• {q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Sprint 13: EMOTIONAL RISKS — доступно только из полной аналитики.
            Sprint 50 hotfix — same readability bump + bolder warning border. */}
        {card && card.emotionalRisks.length > 0 && (
          <div className="mt-4 rounded-lg border-2 border-danger/40 bg-danger/10 px-4 py-3">
            <SectionLabel icon={<HeartCrack size={13} className="text-danger" />}>
              Что может сломать сделку
            </SectionLabel>
            <ul className="space-y-1.5">
              {card.emotionalRisks.map((line, i) => (
                <li key={i} className="text-[14px] text-primary leading-relaxed">⚠ {line}</li>
              ))}
            </ul>
          </div>
        )}

        {/* WHAT NOT TO DO — same treatment. */}
        {card && card.whatNotToDo.length > 0 && (
          <div className="mt-4 rounded-lg border-2 border-danger/35 bg-danger/10 px-4 py-3">
            <SectionLabel icon={<Ban size={13} className="text-danger" />}>Что НЕ делать сейчас</SectionLabel>
            <ul className="space-y-1.5">
              {card.whatNotToDo.map((line, i) => (
                <li key={i} className="text-[14px] text-primary leading-relaxed">— {line}</li>
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
          Этапы разговора — что ещё нужно закрыть
        </SectionLabel>
        <div className="flex items-center gap-1.5">
          {(['S', 'P', 'I', 'N'] as const).map((stage) => {
            const isOpen = card.spinGaps.includes(stage);
            const isCurrent = card.spinStage === stage;
            // Sprint 53 — короткие нейтральные ярлыки 1/2/3/4 вместо С/П/У/Р.
            // Полное человеческое название отображается в title (tooltip).
            const stageNum = stage === 'S' ? '1' : stage === 'P' ? '2' : stage === 'I' ? '3' : '4';
            const stageHuman = STAGE_LABEL[stage];
            return (
              <div
                key={stage}
                className={`flex-1 text-center text-[11px] font-semibold rounded-md py-1.5 border
                  ${isCurrent
                    ? 'bg-ai/15 border-ai/40 text-ai-glow'
                    : isOpen
                      ? 'bg-warning/10 border-warning/30 text-warning'
                      : 'bg-surface border-line text-muted line-through'}`}
                title={`${stageHuman}${isCurrent ? ' — текущий этап' : isOpen ? ' — ещё открыт' : ' — закрыт'}`}
              >
                {stageNum}
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
      // Sprint 50 P0.1 — каждый клик «Зафиксировать результат» получает
      // свой idempotency-key. Двойной клик / retry того же типа возвращает
      // тот же outcome без второй записи.
      await createOutcome({
        adviceEventId,
        projectId,
        investorName,
        outcomeType: type,
      }, newIdempotencyKey());
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

// Sprint 50 hotfix — meeting prep plan view. Renders the 8 sections of the
// MeetingPlan returned by /api/sales-assistant/prepare. Distinct from
// AdviceCard (live "what to say next") — this is the pre-call strategy.
function MeetingPlanCard({ plan, title = 'План встречи' }: { plan: MeetingPlan; title?: string }) {
  const TONE_LABEL: Record<MeetingPlan['conversationStyle']['tone'], string> = {
    aggressive: 'Активно вести разговор',
    soft: 'Мягко, без давления',
    consultative: 'Консультативно',
  };
  const SPEAK_LABEL: Record<MeetingPlan['conversationStyle']['speakOrListen'], string> = {
    listen_more: 'Слушать больше, чем говорить',
    lead_more: 'Вести разговор',
    balanced: 'Сбалансированно',
  };

  return (
    <Card padded accent="ai">
      <div className="flex items-center gap-2 mb-4">
        <Compass size={16} className="text-ai-glow" />
        <h2 className="text-[13px] uppercase tracking-[0.16em] text-ai-glow font-bold">
          {title}
        </h2>
        {plan.promptSource === 'db' && <StatusBadge tone="success" dot>шаблон из админки</StatusBadge>}
        {plan.promptSource === 'fallback' && !plan.fellBackToMock && <StatusBadge tone="warning" dot>резервный шаблон</StatusBadge>}
        {plan.fellBackToMock && <StatusBadge tone="warning" dot>резервная подготовка</StatusBadge>}
      </div>

      {/* 1. ЦЕЛЬ */}
      <div className="rounded-lg border-2 border-ai/40 bg-canvas px-4 py-3 mb-4">
        <SectionLabel icon={<Target size={14} className="text-zapusk-400" />}>Цель встречи</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <PlanField label="Что понять" value={plan.objective.understand} />
          <PlanField label="Что продать" value={plan.objective.sell} />
          <PlanField label="Outcome" value={plan.objective.outcome} />
        </div>
      </div>

      {/* 2. КАК ВЕСТИ */}
      <div className="rounded-lg border border-ai/30 bg-canvas px-4 py-3 mb-4">
        <SectionLabel icon={<Wand2 size={13} className="text-ai-glow" />}>Как вести разговор</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <PlanField label="Тон" value={TONE_LABEL[plan.conversationStyle.tone]} />
          <PlanField label="Темп" value={SPEAK_LABEL[plan.conversationStyle.speakOrListen]} />
          <PlanField label="Когда переходить к pitch" value={plan.conversationStyle.whenToPitch} />
        </div>
      </div>

      {/* 3. ПЕРВЫЕ ВОПРОСЫ */}
      {plan.openingQuestions.length > 0 && (
        <div className="rounded-lg border border-ai/30 bg-canvas px-4 py-3 mb-4">
          <SectionLabel icon={<HelpCircle size={13} className="text-muted" />}>Первые вопросы</SectionLabel>
          <ul className="space-y-2 mt-2">
            {plan.openingQuestions.map((q, i) => (
              <li key={i} className="text-[14px] text-primary leading-relaxed border-l-2 border-ai/30 pl-3">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4-5. PITCH */}
      <div className="rounded-lg border border-ai/30 bg-canvas px-4 py-3 mb-4">
        <SectionLabel icon={<Megaphone size={13} className="text-zapusk-400" />}>Pitch</SectionLabel>
        <div className="mt-2 space-y-2">
          <PlanField label="Когда" value={plan.pitchTiming} />
          <div>
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">Как звучит</div>
            <blockquote className="bg-ai/8 border border-ai/30 rounded-md px-3 py-2 text-[14px] text-primary leading-relaxed">
              {plan.pitchScript}
            </blockquote>
          </div>
        </div>
      </div>

      {/* 6. НА ЧТО ДАВИТЬ */}
      {plan.leveragePoints.length > 0 && (
        <div className="rounded-lg border border-ai/30 bg-canvas px-4 py-3 mb-4">
          <SectionLabel icon={<Zap size={13} className="text-zapusk-400" />}>На что давить</SectionLabel>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {plan.leveragePoints.map((p, i) => (
              <StatusBadge key={i} tone="zapusk">{p}</StatusBadge>
            ))}
          </div>
        </div>
      )}

      {/* 7. DEALBREAKERS */}
      {plan.dealbreakers.length > 0 && (
        <div className="rounded-lg border-2 border-danger/40 bg-danger/8 px-4 py-3 mb-4">
          <SectionLabel icon={<Ban size={13} className="text-danger" />}>Что может сломать встречу</SectionLabel>
          <ul className="space-y-1.5 mt-2">
            {plan.dealbreakers.map((d, i) => (
              <li key={i} className="text-[14px] text-primary leading-relaxed">— {d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 8. STAGES */}
      {plan.stages.length > 0 && (
        <div className="rounded-lg border border-line bg-canvas px-4 py-3">
          <SectionLabel icon={<KanbanSquare size={13} className="text-muted" />}>План разговора</SectionLabel>
          <ol className="space-y-2 mt-2">
            {plan.stages.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-ai/15 text-ai-glow text-xs font-bold">{i + 1}</span>
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-primary leading-tight">{s.name}</div>
                  {s.goal && <div className="text-[13px] text-secondary leading-relaxed">{s.goal}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

function PrepFlowStep({
  step,
  title,
  text,
  active,
  done,
}: {
  step: string;
  title: string;
  text: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex-1 rounded-lg border px-4 py-3 transition-colors',
        active ? 'border-ai/45 bg-canvas shadow-ai-glow' : 'border-line bg-surface',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted font-bold">{step}</span>
        {done && <StatusBadge tone="success" dot>готово</StatusBadge>}
      </div>
      <div className="mt-1 text-sm font-semibold text-primary">{title}</div>
      <div className="mt-1 text-xs text-secondary leading-relaxed">{text}</div>
    </div>
  );
}

function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1">{label}</div>
      <div className="text-[13.5px] text-primary leading-relaxed">{value}</div>
    </div>
  );
}
