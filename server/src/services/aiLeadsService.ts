import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type AILeadStatus = 'HOT' | 'NEW' | 'WAITING' | 'CONTACTED';
export type AILeadChannel = 'AI_CALL' | 'TELEGRAM' | 'WHATSAPP' | 'AVITO' | 'FOLLOW_UP';
export type BriefingState = 'draft' | 'in_progress' | 'ready';

export interface AILeadInvestor {
  name: string;
  phone: string;
  checkRange: string;
  decisionWindow: string;
  profile: string;
}

export interface AILeadCommunication {
  id: string;
  channel: AILeadChannel;
  at: string;
  title: string;
  body: string;
  outcome: string;
}

export interface AILead {
  id: string;
  status: AILeadStatus;
  receivedAt: string;
  title: string;
  investor: AILeadInvestor;
  tags: string[];
  aiSummary: string;
  whatHappened: {
    summary: string;
    interest: string;
    objections: string[];
    sent: string[];
    nextStep: string;
  };
  audio: {
    label: string;
    durationSec: number;
    url?: string;
    // Sprint 62.P1 demo hotfix — honest availability flag. true когда сервер
    // подтвердил наличие источника аудио (локальный файл найден или
    // AI_LEADS_RECORDINGS_BASE_URL задан в env). false — UI рендерит честный
    // disabled state «запись недоступна в этом инстансе», а не сломанный
    // <audio> с 404.
    available: boolean;
    // Краткий текстовый снимок разговора. Заполняем из seed.summary, чтобы
    // даже без аудио founder видел, ЧТО произошло на звонке. До Sprint 62.P1
    // эта информация уже была доступна через whatHappened.summary; здесь
    // короткий peek рядом с плеером.
    transcriptPeek: string | null;
  };
  communications: AILeadCommunication[];
}

export interface BriefingBreakdownItem {
  label: string;
  percent: number;
  state: 'complete' | 'partial' | 'missing';
}

export interface BriefingReadiness {
  state: BriefingState;
  percent: number;
  criticalReady: boolean;
  extracted: Array<{ label: string; value: string; confidence: number }>;
  missing: Array<{ category: string; question: string; critical: boolean }>;
  breakdown: BriefingBreakdownItem[];
}

export interface InvestorStrategy {
  positioning: string;
  keyTriggers: string[];
  icpInvestors: string[];
}

export interface AILeadKpis {
  totalLeads: number;
  activeToday: number;
  avgCheck: string;
  callsToday: number;
  messagesSent: number;
}

export interface LeadReplacementPolicy {
  title: string;
  minimumTargetLeads: number;
  description: string;
  replacementTriggers: string[];
  contactAttempts: number;
  disclaimers: string[];
}

// Sprint 27 — mode разделяет «реальный пустой кабинет», «реальный кабинет с
// лидами» и «демо-витрину Главснаб». UI решает по mode, что показывать.
// • empty — active кабинет, leads ещё не запущены (или их 0 в БД)
// • live  — active кабинет, есть реальные лиды (когда сделаем persistence)
// • demo  — demo workspace или /demo/* showcase, мок-данные легитимны
export type AILeadsMode = 'empty' | 'live' | 'demo';

export interface AILeadsDashboard {
  mode: AILeadsMode;
  projectId: string | null;
  projectName: string;
  onboarding: {
    title: string;
    description: string;
    cta: string;
    launchEnabled: boolean;
    launchLabel: string;
  };
  readiness: BriefingReadiness;
  strategy: InvestorStrategy;
  kpis: AILeadKpis;
  replacementPolicy: LeadReplacementPolicy;
  leads: AILead[];
}

export interface LeadProviderOptions {
  /** true = пользователь в demo workspace (Sprint 24) — можно показать mock-лиды. */
  demoMode?: boolean;
}

export interface LeadProvider {
  getDashboard(
    project: ProjectForAILeads | null,
    options?: LeadProviderOptions,
  ): Promise<AILeadsDashboard>;
}

export interface AICommunicationProvider {
  listCommunications(leadId: string): Promise<AILeadCommunication[]>;
}

export interface TranscriptProvider {
  getRecordingTranscript(leadId: string): Promise<string | null>;
}

export interface LeadReplacementPolicyProvider {
  getPolicy(): LeadReplacementPolicy;
}

export interface ProjectForAILeads {
  id: string;
  name: string;
  industry: string | null;
  stage: string | null;
  raiseAmount: number | null;
  minCheck: number | null;
  equityOffered: number | null;
  files: Array<{ id: string; category: string }>;
  brief: {
    version: number;
    businessSummary: string | null;
    monetization: string | null;
    keyMetrics: string | null;
    investmentAsk: string | null;
    missingData: string | null;
    missingByCategory: string | null;
    napkin: string | null;
  } | null;
}

class ContractLeadReplacementPolicy implements LeadReplacementPolicyProvider {
  getPolicy(): LeadReplacementPolicy {
    return {
      title: 'Минимум 50 целевых лидов',
      minimumTargetLeads: 50,
      description: 'Если контакт не подтверждает интерес или не выходит на связь, такой лид заменяется. Это гарантия количества целевых лидов, а не гарантия инвестиций.',
      contactAttempts: 5,
      replacementTriggers: [
        'инвестор не отвечает после серии касаний',
        'не подтверждает интерес к инвестициям',
        'отказывается от инвестиций',
        'не выходит на связь 7 дней',
        'контакт ошибочный или повторный',
      ],
      disclaimers: [
        'не гарантируем факт инвестирования',
        'не гарантируем доходность проекта',
        'передаём только квалифицированный интерес и контекст общения',
      ],
    };
  }
}

class MockAILeadsProvider implements LeadProvider {
  private policy = new ContractLeadReplacementPolicy();

  async getDashboard(
    project: ProjectForAILeads | null,
    options: LeadProviderOptions = {},
  ): Promise<AILeadsDashboard> {
    const readiness = buildReadiness(project);
    const demoMode = Boolean(options.demoMode);
    // Sprint 27 — mock-лиды и demo-KPI остаются ТОЛЬКО для demo workspace
    // (Sprint 24) и /demo/* витрин. Реальный active кабинет получает пустое
    // состояние: leads=[], kpis=0/0/0. Никаких fake-completed states в боевом
    // кабинете.
    const leads = demoMode ? mockLeads(project?.name ?? 'ваш проект') : [];
    const mode: AILeadsMode = demoMode ? 'demo' : 'empty';

    return {
      mode,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'Проект не выбран',
      onboarding: this.onboardingFor(mode, readiness),
      readiness,
      strategy: buildStrategy(project),
      kpis: demoMode
        ? { totalLeads: leads.length, activeToday: 7, avgCheck: '2,8 млн ₽', callsToday: 43, messagesSent: 128 }
        : { totalLeads: 0, activeToday: 0, avgCheck: '—', callsToday: 0, messagesSent: 0 },
      replacementPolicy: this.policy.getPolicy(),
      leads,
    };
  }

  private onboardingFor(mode: AILeadsMode, readiness: BriefingReadiness) {
    if (mode === 'demo') {
      return {
        title: readiness.criticalReady ? 'AI начал поиск инвесторов' : 'Подготовьте AI к поиску инвесторов',
        description: readiness.criticalReady
          ? 'AI-агенты используют ваш бриф, investor profile и сценарии коммуникации, чтобы ежедневно приводить заинтересованных инвесторов.'
          : 'AI изучит материалы проекта, подготовит сценарии коммуникации и начнёт привлекать инвесторов после завершения briefing.',
        cta: readiness.criticalReady ? 'Запустить AI-привлечение инвесторов' : 'Заполнить бриф',
        launchEnabled: readiness.criticalReady,
        launchLabel: readiness.criticalReady
          ? 'Запустить AI-привлечение инвесторов'
          : 'Запуск AI-лидов станет доступен после завершения briefing',
      };
    }
    // empty / live: честная коммуникация — мы ничего не делаем, пока не дойдём
    // до этапа AI-leads в pipeline проекта. Никаких «43 звонка сегодня».
    return {
      title: readiness.criticalReady ? 'Готовы запустить AI-лидогенерацию' : 'AI-лидогенерация откроется позже',
      description: readiness.criticalReady
        ? 'Бриф готов. После согласования упаковки и юридической части мы запустим AI-каналы — звонки, мессенджеры, follow-up.'
        : 'Заполните бриф проекта — без него AI не сможет квалифицировать инвесторов и презентовать сделку.',
      cta: readiness.criticalReady ? 'Запросить запуск у менеджера' : 'Заполнить бриф',
      launchEnabled: false,
      launchLabel: readiness.criticalReady
        ? 'Запуск AI-лидов согласовывает менеджер после готовности упаковки'
        : 'Запуск AI-лидов откроется после завершения брифа и упаковки',
    };
  }
}

export const leadProvider: LeadProvider = new MockAILeadsProvider();

function buildReadiness(project: ProjectForAILeads | null): BriefingReadiness {
  if (!project) {
    return {
      state: 'draft',
      percent: 12,
      criticalReady: false,
      extracted: [],
      missing: [
        { category: 'project', question: 'Создайте проект и загрузите исходные материалы', critical: true },
        { category: 'investment_offer', question: 'Укажите сумму привлечения и минимальный чек', critical: true },
      ],
      breakdown: breakdown(10, 0, 0, 0),
    };
  }

  const missingFromBrief = parseJsonArray(project.brief?.missingData).slice(0, 5);
  const hasBrief = Boolean(project.brief);
  const hasFiles = project.files.length > 0;
  const legal = project.name && (project.industry || project.stage) ? 100 : project.name ? 70 : 20;
  const finance = score([
    Boolean(project.raiseAmount),
    Boolean(project.minCheck),
    Boolean(project.equityOffered),
    Boolean(project.brief?.investmentAsk),
    Boolean(project.brief?.keyMetrics),
  ]);
  const marketing = score([
    Boolean(project.industry),
    hasFiles,
    Boolean(project.brief?.businessSummary),
    Boolean(project.brief?.monetization),
  ]);
  const offer = score([
    Boolean(project.raiseAmount),
    Boolean(project.minCheck),
    Boolean(project.equityOffered),
    Boolean(project.brief?.napkin),
  ]);
  const percent = Math.round((legal + finance + marketing + offer) / 4);
  const criticalReady = hasBrief && finance >= 60 && offer >= 60;

  const missing = [
    ...(!project.minCheck ? [{ category: 'investment_offer', question: 'Минимальный чек инвестора', critical: true }] : []),
    ...(!project.raiseAmount ? [{ category: 'finance', question: 'Сумма раунда', critical: true }] : []),
    ...(!project.equityOffered ? [{ category: 'investment_offer', question: 'Структура сделки и доля', critical: true }] : []),
    ...(!project.brief?.keyMetrics ? [{ category: 'unit_econ', question: 'Юнит-экономика, LTV/CAC и маржинальность', critical: false }] : []),
    ...missingFromBrief.map((question) => ({ category: 'brief', question, critical: false })),
  ].slice(0, 7);

  return {
    state: criticalReady ? 'ready' : hasFiles || hasBrief ? 'in_progress' : 'draft',
    percent,
    criticalReady,
    extracted: [
      { label: 'Название проекта', value: project.name, confidence: 98 },
      { label: 'Отрасль', value: project.industry ?? 'не найдена', confidence: project.industry ? 86 : 28 },
      { label: 'Стадия', value: project.stage ?? 'не найдена', confidence: project.stage ? 74 : 22 },
      { label: 'Сумма раунда', value: project.raiseAmount ? `${formatMoney(project.raiseAmount)} ₽` : 'не найдена', confidence: project.raiseAmount ? 82 : 18 },
      { label: 'Минимальный чек', value: project.minCheck ? `${formatMoney(project.minCheck)} ₽` : 'не найден', confidence: project.minCheck ? 79 : 18 },
    ],
    missing,
    breakdown: breakdown(legal, finance, marketing, offer),
  };
}

function buildStrategy(project: ProjectForAILeads | null): InvestorStrategy {
  const projectName = project?.name ?? 'проекта';
  return {
    positioning: `AI будет продавать ${projectName} через понятную инвестору связку: сумма входа, логика возврата капитала, контроль рисков и следующий шаг к созвону.`,
    keyTriggers: ['cashflow', 'дивиденды', 'рост', 'pre-IPO', 'недвижимость', 'AI', 'экспорт', 'контроль рисков'],
    icpInvestors: [
      'частные инвесторы с чеком от 1 млн ₽',
      'предприниматели с действующим бизнесом',
      'инвесторы, которые уже покупали доли / займы / недвижимость',
      'партнёры, которым нужен понятный cashflow и прозрачный контроль',
    ],
  };
}

// Sprint 35 P1 — demo leads больше НЕ содержат реальных телефонов, имён и
// ссылок на external CRM (aicallscloud.ru). Это синтетические данные с тем же
// shape, что и реальный feed, но без PII: маскированные телефоны, синтетические
// имена «Инвестор А/Б/В…», recording URL ведёт на локальный demo-asset.
// На UI присутствует пометка «Это демонстрационные данные, не реальные лиды».
//
// Sprint 62.P1 demo hotfix — Sprint 35 заменил external CRM URLs на локальные
// заглушки, но реальные .wav файлы в /public/demo-assets/recordings/ так и не
// были добавлены. UI показывал сломанный <audio> с 404 → founder говорил
// «разговоры пропали». Теперь:
//   • При boot читаем список UUID'ов в /public/demo-assets/recordings/ (если
//     папка есть). Кешируем — это не меняется на лету.
//   • Если ops задал `AI_LEADS_RECORDINGS_BASE_URL` (например, прокси к CRM
//     через service-auth), используем его как base — `available` тогда всегда
//     true (ops подтвердил, что источник живой).
//   • Иначе available = exists in local folder. UI рендерит честный disabled
//     state когда false.
//   • URL всё равно выдаём, чтобы кнопка «Открыть запись» работала, когда
//     операционная команда подключит источник без redeploy.

// Cache the file listing once at boot. The recordings folder is meant for the
// demo bundle — files don't change at runtime. If they do (rsync during ops),
// a server restart is the right invalidation point.
let cachedAvailableRecordings: Set<string> | null = null;
function getAvailableRecordings(): Set<string> {
  if (cachedAvailableRecordings) return cachedAvailableRecordings;
  const found = new Set<string>();
  // server/dist/services/*.js (prod) → project root = ../../../../
  // server/src/services/*.ts (dev via tsx) → same.
  const candidatePaths = [
    path.resolve(process.cwd(), 'web/public/demo-assets/recordings'),
    path.resolve(process.cwd(), '../web/public/demo-assets/recordings'),
    path.resolve(process.cwd(), '../../web/public/demo-assets/recordings'),
  ];
  for (const dir of candidatePaths) {
    try {
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        // Accept .wav, .mp3, .m4a — UUID match on the basename.
        const m = file.match(/^([0-9a-f-]{8,40})\.(?:wav|mp3|m4a)$/i);
        if (m) found.add(m[1].toLowerCase());
      }
      // First directory that resolves wins; stop scanning to avoid duplicates.
      break;
    } catch {
      /* directory not readable in some sandboxed prod — ignore, fall through */
    }
  }
  cachedAvailableRecordings = found;
  if (found.size > 0) {
    console.log(`[ai-leads] recordings folder scanned: ${found.size} files detected`);
  } else {
    console.log('[ai-leads] no local recordings found — UI will render disabled state. ' +
      'Drop .wav/.mp3/.m4a files into web/public/demo-assets/recordings/ named by recordingId, ' +
      'or set AI_LEADS_RECORDINGS_BASE_URL to a CDN/proxy base.');
  }
  return cachedAvailableRecordings;
}

function recordingsBaseUrl(): string | null {
  const v = process.env.AI_LEADS_RECORDINGS_BASE_URL;
  if (!v || !v.trim()) return null;
  return v.replace(/\/$/, '');
}

interface ResolvedRecording {
  url: string;
  available: boolean;
}

// Sprint 62.P1 demo hotfix — resolution cascade (priority order):
//   1. AI_LEADS_RECORDINGS_BASE_URL env → private CDN/proxy proxied URL. Ops
//      opted in; trust the source.
//   2. Local file in web/public/demo-assets/recordings/ → bundled wav/mp3/m4a.
//   3. seed.audioUrl (external aicallscloud.ru fallback) → public CRM URL
//      provided directly in the seed. The founder explicitly opted into
//      these URLs for the demo (rev'd Sprint 35 sanitization for the curated
//      9-call set, see mockLeads comments).
//   4. None of the above → honest disabled state in UI.
function resolveRecording(recordingId: string, externalFallbackUrl?: string): ResolvedRecording {
  const base = recordingsBaseUrl();
  if (base) {
    return { url: `${base}/${recordingId}.wav`, available: true };
  }
  if (getAvailableRecordings().has(recordingId.toLowerCase())) {
    return { url: `/demo-assets/recordings/${recordingId}.wav`, available: true };
  }
  if (externalFallbackUrl) {
    return { url: externalFallbackUrl, available: true };
  }
  return { url: `/demo-assets/recordings/${recordingId}.wav`, available: false };
}

function mockLeads(projectName: string): AILead[] {
  const now = Date.now();

  type Seed = {
    id: string;
    status: AILeadStatus;
    minutesAgo: number;
    name: string;
    phone: string;
    check: string;
    horizon: string;
    profile: string;
    tags: string[];
    summary: string;
    detail: string;
    objection?: string;
    nextStep: string;
    sent: string[];
    recordingId: string;
    // Sprint 62.P1 demo hotfix — optional external playable URL. Used when
    // the recording is hosted on a public source the founder explicitly
    // approved for the demo (e.g. aicallscloud.ru/api/process-record-url).
    // resolveRecording cascades: env override → local file → this →
    // disabled.
    audioUrl?: string;
    durationSec: number;
  };

  // Sprint 62.P1 demo hotfix — 9 real lead recordings curated by the
  // founder. Audio URLs point to public aicallscloud.ru/api/process-record-url
  // (no auth required), so the embedded <audio> player works from the public
  // Render demo without proxying through this backend.
  //
  // Identity masking (founder-approved Sprint 62.P1 follow-up):
  //   • Display name is anonymised — «Инвестор А./Б./В…» / «Без имени».
  //     Real first names + patronymics that landed during the audio review
  //     (Анатолий, Виктор Николаевич, Татьяна Андреевна, Алексей, Илья,
  //     Дмитрий) are stripped from every text field (name, summary, detail,
  //     objection, profile, nextStep, sent).
  //   • Phones masked — «скрыто для Демо».
  //   • Identity-revealing context kept generic (e.g. «опыт работы с
  //     крупным ритейлером» вместо конкретной компании).
  //
  // ⚠ Audio content not redacted: the recordings themselves still contain
  // the investor's voice and may include first names / company references
  // spoken aloud. Before showing this on a fully-public URL, the founder
  // confirms each recording is safe (or swaps for an audio-redacted copy).
  //
  // Ordering: most recent first. minutesAgo just affects the displayed
  // «N мин назад» label.
  const aicall = (uuid: string) =>
    `https://aicallscloud.ru/api/process-record-url?recordUrl=${uuid}.wav`;
  const seeds: Seed[] = [
    {
      id: 'lead-anatoly', status: 'WAITING', minutesAgo: 6,
      name: 'Инвестор А.', phone: 'скрыто для Демо',
      check: 'от 1 млн ₽', horizon: 'после обсуждения договора', profile: 'юр/управ. background, осторожен',
      tags: ['CONTRACT REVIEW', 'LEGAL BG'],
      summary: 'Интересуется инвестициями, скептичен к гарантиям. Образование юридическое + управленческое (опыт работы с крупным ритейлером). Готов от 1 млн ₽.',
      detail: 'Подробно обсудит договор инвестирования; ключевой блок — обременение недвижимости компании. Скепсис по поводу стабильности рынка стройматериалов. Хочет видеть финансовую отчётность для отслеживания экономики.',
      objection: 'Скепсис по поводу стабильности рынка стройматериалов. Требует разбор обременения недвижимости и доступ к финансовой отчётности.',
      nextStep: 'Звонок специалиста с разбором договора и блока обременения недвижимости',
      sent: ['резюме сделки', 'блок гарантий и обременения'],
      recordingId: 'a9998a0a-ef71-4b6d-b559-70fd5c4b57ef',
      audioUrl: aicall('a9998a0a-ef71-4b6d-b559-70fd5c4b57ef'),
      durationSec: 240,
    },
    {
      id: 'lead-unknown-1month', status: 'WAITING', minutesAgo: 22,
      name: 'Без имени', phone: 'скрыто для Демо',
      check: 'от 1 млн ₽', horizon: '1 месяц', profile: 'ждёт звонка специалиста',
      tags: ['MATERIALS REQUESTED', 'AWAITING CALL'],
      summary: 'Предложение заинтересовало. Запрошен пакет документов и ссылки. Ожидание звонка специалиста.',
      detail: 'Готовность к дальнейшему взаимодействию: сначала материалы → звонок специалиста. Чек от 1 млн ₽, горизонт 1 месяц.',
      nextStep: 'Отправить пакет документов, согласовать звонок специалиста',
      sent: ['пакет документов', 'ссылки'],
      recordingId: '0ed73e45-ab1e-4a1d-ae4c-435d49bd6f77',
      audioUrl: aicall('0ed73e45-ab1e-4a1d-ae4c-435d49bd6f77'),
      durationSec: 175,
    },
    {
      id: 'lead-victor', status: 'HOT', minutesAgo: 41,
      name: 'Инвестор Б.', phone: 'скрыто для Демо',
      check: 'от 1 млн ₽', horizon: 'в течение недели', profile: 'готов к взаимодействию',
      tags: ['HOT', 'READY FOR CALL'],
      summary: 'Предложение заинтересовало, готовность перейти к звонку со специалистом.',
      detail: 'Подтверждён интерес и комфортный чек. Решение готов принять в течение недели.',
      nextStep: 'Согласовать время созвона с фаундером',
      sent: ['короткое резюме сделки', 'инвестиционное предложение'],
      recordingId: '661a66bd-9c5d-4e97-8294-b9edd9af9a90',
      audioUrl: aicall('661a66bd-9c5d-4e97-8294-b9edd9af9a90'),
      durationSec: 168,
    },
    {
      id: 'lead-tatiana', status: 'HOT', minutesAgo: 73,
      name: 'Инвестор В.', phone: 'скрыто для Демо',
      check: 'от 1 млн ₽', horizon: '1-2 недели', profile: 'готовность к взаимодействию',
      tags: ['HOT', 'QUALIFIED'],
      summary: 'Подтверждён интерес. Готовность к дальнейшему взаимодействию в горизонте 1-2 недели.',
      detail: 'Чек от 1 млн ₽, срок 1-2 недели, обсуждение условий и порядка выплат.',
      nextStep: 'Отправить условия и согласовать Zoom',
      sent: ['условия сделки', 'FAQ инвестора'],
      recordingId: '11faebc3-9d1e-4256-960a-8389fc9f1e0d',
      audioUrl: aicall('11faebc3-9d1e-4256-960a-8389fc9f1e0d'),
      durationSec: 184,
    },
    {
      id: 'lead-alexey', status: 'HOT', minutesAgo: 110,
      name: 'Инвестор Г.', phone: 'скрыто для Демо',
      check: 'от 1 млн ₽', horizon: 'в течение 30 дней', profile: 'ожидает звонок специалиста',
      tags: ['HOT', 'AWAITING CALL'],
      summary: 'Интерес подтверждён, ожидает звонок специалиста для уточнения деталей сделки.',
      detail: 'AI зафиксировал готовность. Контакт открыт к звонку, чек от 1 млн ₽, срок до 30 дней.',
      nextStep: 'Назначить звонок специалиста в течение 24 часов',
      sent: ['короткий teaser'],
      recordingId: 'd2a0157d-8e93-418f-87c7-a864832665b7',
      audioUrl: aicall('d2a0157d-8e93-418f-87c7-a864832665b7'),
      durationSec: 152,
    },
    {
      id: 'lead-ilya', status: 'WAITING', minutesAgo: 148,
      name: 'Инвестор Д.', phone: 'скрыто для Демо',
      check: '1-5 млн ₽', horizon: 'в течение 30 дней', profile: 'просит сначала материалы',
      tags: ['MATERIALS REQUESTED', 'WARM'],
      summary: 'Интерес подтверждён. Сначала — изучение материалов, далее готовность обсуждать.',
      detail: 'Готовность к диалогу после получения презентации и one-pager. Диапазон чека выше базового — 1 до 5 млн ₽.',
      nextStep: 'Отправить пакет материалов и follow-up через 2 дня',
      sent: ['презентация', 'one-pager', 'follow-up план'],
      recordingId: '71863075-3bcf-4ee1-9089-58fc7e2a8252',
      audioUrl: aicall('71863075-3bcf-4ee1-9089-58fc7e2a8252'),
      durationSec: 198,
    },
    {
      id: 'lead-unknown-30d', status: 'WAITING', minutesAgo: 195,
      name: 'Без имени', phone: 'скрыто для Демо',
      check: 'от 1 млн ₽', horizon: 'в течение 30 дней', profile: 'просит сначала материалы',
      tags: ['MATERIALS REQUESTED'],
      summary: 'Заинтересовался предложением, запрошен пакет материалов перед обсуждением.',
      detail: 'Готовность к дальнейшему взаимодействию после изучения материалов. Чек от 1 млн ₽, срок 30 дней.',
      nextStep: 'Отправить материалы и зафиксировать контакт-имя',
      sent: ['презентация', 'инвестиционное предложение'],
      recordingId: 'bec44e43-40ba-45cc-9003-de5401263d1d',
      audioUrl: aicall('bec44e43-40ba-45cc-9003-de5401263d1d'),
      durationSec: 142,
    },
    {
      id: 'lead-unknown-guarantees', status: 'WAITING', minutesAgo: 247,
      name: 'Без имени', phone: 'скрыто для Демо',
      check: 'от 1 млн ₽', horizon: 'в течение 30 дней', profile: 'интересуют гарантии',
      tags: ['GUARANTEES', 'AWAITING CALL'],
      summary: 'Заинтересовался предложением. Обсуждение гарантий со специалистом.',
      objection: 'Просит подробно разобрать гарантии и обязательства сторон.',
      detail: 'Готовность к звонку со специалистом. Чек от 1 млн ₽, срок 30 дней. Решение зависит от ответов по защите капитала.',
      nextStep: 'Назначить звонок и проговорить блок гарантий',
      sent: ['блок гарантий', 'юридическое резюме'],
      recordingId: '26721cca-9aa4-49cf-9d53-b2add193934d',
      audioUrl: aicall('26721cca-9aa4-49cf-9d53-b2add193934d'),
      durationSec: 176,
    },
    {
      id: 'lead-dmitry', status: 'HOT', minutesAgo: 312,
      name: 'Инвестор Е.', phone: 'скрыто для Демо',
      check: 'от 1 млн ₽', horizon: 'повторный звонок завтра 18:00', profile: 'цель — доход до 50% годовых',
      tags: ['HOT', 'SCHEDULED', 'YIELD FOCUS'],
      summary: 'Интересуется инвестициями с доходом до 50% годовых. Согласован повторный звонок завтра в 18:00.',
      detail: 'Готовность рассмотреть сумму от 1 000 000 ₽. Запрошена подробная информация о гарантиях и объекте инвестиций.',
      objection: 'Требует подробную информацию о гарантиях и конкретном объекте инвестирования до принятия решения.',
      nextStep: 'Подтвердить повторный звонок завтра в 18:00 и подготовить раздел гарантий',
      sent: ['короткое резюме сделки'],
      recordingId: 'd06539dc-f2fd-4305-9c09-8a0c98c7d23e',
      audioUrl: aicall('d06539dc-f2fd-4305-9c09-8a0c98c7d23e'),
      durationSec: 220,
    },
  ];

  return seeds.map((seed) => {
    const resolved = resolveRecording(seed.recordingId, seed.audioUrl);
    return {
      id: seed.id,
      status: seed.status,
      receivedAt: new Date(now - seed.minutesAgo * 60_000).toISOString(),
      title: `Квалифицированный лид · ${seed.name}`,
      investor: {
        name: seed.name,
        phone: seed.phone,
        checkRange: seed.check,
        decisionWindow: seed.horizon,
        profile: seed.profile,
      },
      tags: seed.tags,
      aiSummary: seed.summary,
      whatHappened: {
        summary: seed.detail,
        interest: seed.profile,
        objections: seed.objection ? [seed.objection] : [],
        sent: seed.sent,
        nextStep: seed.nextStep,
      },
      audio: {
        label: `Запись AI-разговора · ${seed.name}`,
        durationSec: seed.durationSec,
        url: resolved.url,
        available: resolved.available,
        // Краткий текстовый снимок — то, что AI зафиксировал в разговоре.
        // Видно сразу под плеером, даже если аудио не загружено.
        transcriptPeek: seed.detail,
      },
      communications: communicationsFor(seed, projectName, now),
    };
  });
}

function communicationsFor(seed: { id: string; minutesAgo: number; sent: string[] }, projectName: string, now: number): AILeadCommunication[] {
  const base = now - seed.minutesAgo * 60_000;
  return [
    {
      id: `${seed.id}-call`,
      channel: 'AI_CALL',
      at: new Date(base).toISOString(),
      title: 'AI-звонок',
      body: `AI коротко презентовал ${projectName}, проверил опыт инвестиций и подтвердил комфортный чек.`,
      outcome: 'контакт подтвердил интерес',
    },
    {
      id: `${seed.id}-tg`,
      channel: 'TELEGRAM',
      at: new Date(base + 14 * 60_000).toISOString(),
      title: 'Сообщение в мессенджер',
      body: `Отправлены: ${seed.sent.join(', ')}.`,
      outcome: 'материалы доставлены',
    },
    {
      id: `${seed.id}-follow`,
      channel: 'FOLLOW_UP',
      at: new Date(base + 36 * 60_000).toISOString(),
      title: 'Follow-up',
      body: 'AI зафиксировал next step и поставил напоминание на повторное касание.',
      outcome: 'ожидаем ответа инвестора',
    },
  ];
}

// Legacy lead() helper removed — mockLeads() now builds AILeads directly from
// production-shaped seeds with real recording URLs.

function score(items: boolean[]): number {
  return Math.round((items.filter(Boolean).length / items.length) * 100);
}

function breakdown(legal: number, finance: number, marketing: number, offer: number): BriefingBreakdownItem[] {
  return [
    { label: 'Юридический блок', percent: legal, state: stateFor(legal) },
    { label: 'Финансы', percent: finance, state: stateFor(finance) },
    { label: 'Маркетинг', percent: marketing, state: stateFor(marketing) },
    { label: 'Investment offer', percent: offer, state: stateFor(offer) },
  ];
}

function stateFor(percent: number): BriefingBreakdownItem['state'] {
  if (percent >= 85) return 'complete';
  if (percent >= 45) return 'partial';
  return 'missing';
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}
