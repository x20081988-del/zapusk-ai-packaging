// Sprint 62.P11 — Investor Opportunities as Crowdinvesting Showcase.
// Sprint 62.P12 — Showcase UX/UI upgrade: премиальные cover-визуалы, rich
// data room с реальными ссылками, elevator pitch и social-proof для витрины.
//
// Преобразует Project (бэкенд) в инвестор-facing view-model для витрины
// /opportunities и страницы /opportunities/:id. Никакой cockpit-терминологии:
// только то, что видит инвестор на краудинвестинговой площадке.
//
// Для главных демо-кейсов (Luce Silva, НеоГемовет, Планета 60, Венский ветер)
// контент curated. Для остальных isDemo-проектов — generic-view из брифа.

import type { Project } from './api';
import { formatMoney, formatPercent, STAGE_LABELS, parseObj, parseList } from './format';

export type BadgeTone = 'ai' | 'success' | 'zapusk' | 'neutral' | 'warning';

export interface OpportunityBadge {
  label: string;
  tone: BadgeTone;
}

export interface OpportunityMetric {
  label: string;
  value: string;
  hint?: string;
}

// Cover-визуал. Без бинарных ассетов: премиальный градиент + крупная
// полупрозрачная иконка-watermark (icon резолвится в .tsx по ключу).
// coverUrl — опциональная реальная картинка (если появится в будущем).
export type CoverIcon =
  | 'flower' | 'dna' | 'planet' | 'wind' | 'building' | 'rocket' | 'leaf' | 'gem' | 'sparkles';

export interface OpportunityCover {
  gradient: string;
  icon: CoverIcon;
  accent: BadgeTone;
  coverUrl?: string;
}

// Документ data room / открытого материала. Rich-карточка: тип, размер,
// описание, ссылка (реальная или previewUrl из PackagingJob), флаг locked.
export interface OpportunityDocument {
  title: string;
  type: string;
  description: string;
  /** Человекочитаемый размер/формат: «PDF · 12 стр.», «Google Sheets». */
  size?: string;
  /** Прямая ссылка (реальные материалы) — открывается в новой вкладке. */
  url?: string;
  /** Связка с PackagingJob.outputType — чтобы подтянуть previewUrl. */
  outputType?: string;
  /** true → материал за формой заявки (квалификация инвестора). */
  locked: boolean;
}

export interface DealStep {
  title: string;
  description: string;
}

export interface OpportunityThesis {
  whyInteresting: string;
  howEarn: string;
  whyNow: string;
  risks: string;
}

export interface OpportunityView {
  // Card-level
  cover: OpportunityCover;
  tagline: string;
  sector: string;
  shortThesis: string;
  statusLabel: string;
  statusTone: BadgeTone;
  upside: string;
  payback: string | null;
  badges: OpportunityBadge[];
  highlights: string[];
  scarcity: string;
  // Detail-level
  subtitle: string;
  thesis: OpportunityThesis;
  metrics: OpportunityMetric[];
  publicMaterials: OpportunityDocument[];
  dataRoom: OpportunityDocument[];
  dealSteps: DealStep[];
  legal: string[];
}

// ─── shared constants ────────────────────────────────────────

const DEAL_STEPS: DealStep[] = [
  { title: 'Оставляете заявку', description: 'Заполняете короткую форму на витрине: контакт, размер чека и цель. Это ни к чему не обязывает.' },
  { title: 'Менеджер уточняет профиль', description: 'Менеджер ZAPUSK AI связывается с вами, отвечает на вопросы и квалифицирует интерес к сделке.' },
  { title: 'Получаете data room', description: 'После квалификации открываем полный пакет: финмодель, юридическую структуру, договоры и подтверждающие документы.' },
  { title: 'Сделка через платформу', description: 'Оформление доли и расчёты проходят через платформу ZAPUSK AI с сопровождением на каждом шаге.' },
];

const LEGAL: string[] = [
  'ZAPUSK AI — лицензированная платформа для упаковки и сопровождения инвестиционных сделок.',
  'Доходность не гарантирована. Инвестиции в частные компании сопряжены с риском полной потери капитала.',
  'Материалы носят информационный характер и не являются индивидуальной инвестиционной рекомендацией.',
  'Доступ к полному data room открывается после квалификации инвестора менеджером платформы.',
];

// Полный data room — что откроется после заявки (общий список, дополняется
// curated-кейсами). Rich-документы с типом и размером.
const GENERIC_DATA_ROOM: OpportunityDocument[] = [
  { title: 'Детальная финансовая модель', type: 'Финмодель', size: 'Excel · помесячно, сценарии', description: 'Полная модель со сценариями выручки, расходов и точкой окупаемости.', locked: true },
  { title: 'Юридическая структура сделки', type: 'Юр-структура', size: 'PDF · пакет', description: 'Корпоративные документы, структура владения и условия входа.', locked: true },
  { title: 'Договоры и существенные контракты', type: 'Договоры', size: 'PDF · пакет', description: 'Ключевые контракты, обременения и обязательства проекта.', locked: true },
  { title: 'Подтверждающие документы и отчётность', type: 'Отчётность', size: 'PDF · пакет', description: 'Управленческая отчётность и подтверждение операционных цифр.', locked: true },
  { title: 'Исследование рынка и конкурентов', type: 'Рынок', size: 'PDF · аналитика', description: 'Оценка рынка, конкурентного поля и позиционирования.', locked: true },
  { title: 'Cap table и структура владения', type: 'Cap table', size: 'Excel', description: 'Доли участников до и после раунда.', locked: true },
  { title: 'Записи встреч и Q&A с фаундером', type: 'Q&A', size: 'Видео + конспект', description: 'Запись сессий с командой и ответы на вопросы инвесторов.', locked: true },
];

// ─── covers ──────────────────────────────────────────────────

const GRAD = {
  emerald: 'linear-gradient(135deg, #0f766e 0%, #15803d 48%, #166534 100%)',
  bio:     'linear-gradient(135deg, #6d28d9 0%, #7c3aed 42%, #be185d 100%)',
  cosmic:  'linear-gradient(135deg, #1e3a8a 0%, #4338ca 50%, #6d28d9 100%)',
  sunrise: 'linear-gradient(135deg, #ea580c 0%, #f97316 46%, #db2777 100%)',
  teal:    'linear-gradient(135deg, #0e7490 0%, #0891b2 50%, #0d9488 100%)',
  slate:   'linear-gradient(135deg, #334155 0%, #1f2937 60%, #0f172a 100%)',
} as const;

const GENERIC_COVERS: OpportunityCover[] = [
  { gradient: GRAD.sunrise, icon: 'rocket', accent: 'zapusk' },
  { gradient: GRAD.teal, icon: 'gem', accent: 'ai' },
  { gradient: GRAD.cosmic, icon: 'sparkles', accent: 'ai' },
  { gradient: GRAD.slate, icon: 'building', accent: 'neutral' },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function genericCover(p: Project): OpportunityCover {
  return GENERIC_COVERS[hash(p.name) % GENERIC_COVERS.length];
}

// ─── badges ──────────────────────────────────────────────────

const TRACK_BADGE: Record<string, OpportunityBadge> = {
  pre_ipo: { label: 'Pre-IPO', tone: 'ai' },
  shareholding: { label: 'Доля в компании', tone: 'zapusk' },
  llc_share: { label: 'Доля в ООО', tone: 'zapusk' },
  convertible: { label: 'Конвертируемый заём', tone: 'neutral' },
  safe: { label: 'SAFE', tone: 'neutral' },
};

function commonBadges(p: Project): OpportunityBadge[] {
  const badges: OpportunityBadge[] = [];
  if (p.investmentTrack && TRACK_BADGE[p.investmentTrack]) badges.push(TRACK_BADGE[p.investmentTrack]);
  badges.push({ label: 'Проверено ZAPUSK AI', tone: 'success' });
  return badges;
}

// ─── status / scarcity ───────────────────────────────────────

function statusFor(p: Project): { statusLabel: string; statusTone: BadgeTone; scarcity: string } {
  if (p.status === 'ready')
    return { statusLabel: 'Открыт сбор заявок', statusTone: 'success', scarcity: 'Раунд открыт · приём заявок ограничен по времени' };
  if (p.status === 'packaging')
    return { statusLabel: 'Готовится к открытию', statusTone: 'ai', scarcity: 'Скоро открытие · можно записаться в лист ожидания' };
  return { statusLabel: 'На проверке', statusTone: 'neutral', scarcity: 'Проект проходит проверку ZAPUSK AI' };
}

// ─── curated cases ───────────────────────────────────────────

const CURATED: Record<string, (p: Project) => Partial<OpportunityView>> = {
  'Luce Silva': (p) => ({
    cover: { gradient: GRAD.emerald, icon: 'flower', accent: 'success' },
    tagline: 'Свадебный event · премиальная недвижимость',
    sector: 'Свадебный event · премиальная недвижимость',
    subtitle: 'Премиальная свадебная площадка — оранжерея в лесу с собственным кейтерингом',
    shortThesis: 'Премиальная свадебная площадка под Москвой: оранжерея в лесу, средний чек ~725 тыс ₽, прибыль ~500 тыс ₽ со свадьбы, 75–150 свадеб за сезон.',
    upside: 'Окупаемость 1–2 сезона, дивиденды до 70% прибыли до выхода на окупаемость',
    payback: '1–2 сезона',
    highlights: [
      'Средний чек свадьбы ~725 тыс ₽',
      'Прибыль ~500 тыс ₽ с одной свадьбы',
      'Окупаемость 1–2 сезона',
    ],
    thesis: {
      whyInteresting: 'Готовый премиальный объект в дефицитном сегменте: оранжерея в лесу с кейтерингом полного цикла. Высокий средний чек и сильная маржинальность одной свадьбы.',
      howEarn: 'Инвестор получает долю 49% в ООО и дивиденды до 70% прибыли до момента окупаемости, далее — пропорционально доле. Деньги зарабатываются на марже с каждой свадьбы и росте загрузки площадки.',
      whyNow: 'Площадка запущена и генерирует выручку, сезон бронируется заранее. Раунд закрывает капитальную часть и масштабирование загрузки до 150 свадеб за сезон.',
      risks: 'Сезонность спроса, зависимость от загрузки площадки и операционной команды. Часть рисков снимается предоплатной моделью бронирований и диверсификацией форматов мероприятий.',
    },
    metrics: [
      { label: 'Раунд', value: formatMoney(p.raiseAmount, p.currency) },
      { label: 'Доля инвестору', value: formatPercent(p.equityOffered) },
      { label: 'Мин. чек', value: formatMoney(p.minCheck, p.currency) },
      { label: 'Средний чек свадьбы', value: '~725 тыс ₽' },
      { label: 'Прибыль со свадьбы', value: '~500 тыс ₽' },
      { label: 'Свадеб за сезон', value: '75–150' },
      { label: 'Выручка за сезон', value: '54–109 млн ₽' },
      { label: 'Окупаемость', value: '1–2 сезона' },
    ],
    publicMaterials: [
      { title: 'Инвестиционная презентация', type: 'Презентация', size: 'Pitch deck', description: 'Концепция площадки, экономика и условия сделки.', outputType: 'pitch_deck', locked: false },
      { title: 'Тизер / ванпейджер', type: 'Тизер', size: 'One-pager', description: 'Сделка на одной странице: суть, цифры, доля.', outputType: 'one_pager', locked: false },
      { title: 'Краткое финансовое резюме', type: 'Финансы', size: 'Сводка', description: 'Выручка, маржа и сценарии загрузки 75/100/150 свадеб.', outputType: 'financial_model', locked: false },
      { title: 'Посадочная страница проекта', type: 'Landing', size: 'Веб-страница', description: 'Публичная страница с визуалом площадки.', outputType: 'landing', locked: false },
      { title: 'FAQ для инвестора', type: 'FAQ', size: 'Документ', description: 'Ответы на частые вопросы по сделке и доле.', outputType: 'faq', locked: false },
    ],
    dataRoom: [
      { title: 'Финмодель: сценарии 75 / 100 / 150 свадеб', type: 'Финмодель', size: 'Excel · помесячно', description: 'Полная модель загрузки площадки и сезонной выручки.', locked: true },
      { title: 'Юридическая структура и продажа доли ООО (49%)', type: 'Юр-структура', size: 'PDF · пакет', description: 'Корпоративная структура и условия входа инвестора.', locked: true },
      { title: 'Договоры на объект и обременения', type: 'Договоры', size: 'PDF · пакет', description: 'Аренда/собственность площадки, обременения.', locked: true },
      { title: 'Управленческая отчётность и выручка', type: 'Отчётность', size: 'PDF + Excel', description: 'Подтверждение выручки и операционных показателей.', locked: true },
      { title: 'Юнит-экономика свадьбы и кейтеринга', type: 'Юнит-экономика', size: 'Excel', description: 'Себестоимость и маржа одной свадьбы.', locked: true },
      { title: 'Cap table и дивидендная политика', type: 'Cap table', size: 'Excel', description: 'Доли и условия выплаты до 70% до окупаемости.', locked: true },
      { title: 'Записи встреч с фаундером и Q&A', type: 'Q&A', size: 'Видео + конспект', description: 'Сессии с командой проекта.', locked: true },
    ],
  }),
  'НеоГемовет': (p) => ({
    cover: { gradient: GRAD.bio, icon: 'dna', accent: 'ai' },
    tagline: 'Ветеринарная биофарма · искусственная кровь',
    sector: 'Ветеринарная биофарма · искусственная кровь',
    subtitle: 'Ветеринарная биофарма — универсальный кровезаменитель для животных',
    shortThesis: 'Биофарма-проект: универсальный кровезаменитель (искусственная кровь) для ветеринарии. Куплены патент и НИР, раунд — на регистрацию, производство и вывод на рынок.',
    upside: 'Выход на регистрацию и производство; масштабируемый продукт с патентной защитой',
    payback: null,
    highlights: [
      'Патент + результаты НИР уже выкуплены',
      'Дефицитный продукт с патентной защитой',
      'Раунд на регистрацию, производство и вывод',
    ],
    thesis: {
      whyInteresting: 'Дефицитный продукт с патентной защитой: универсальный кровезаменитель для ветеринарии. Патент и результаты НИР уже выкуплены у разработчиков — снят ранний R&D-риск.',
      howEarn: 'Инвестор получает долю 25% в ООО. Стоимость доли растёт по мере прохождения регистрации, запуска производства и выхода продукта на рынок ветеринарных клиник и дистрибьюторов.',
      whyNow: 'Проект на стадии MVP с готовой научной базой. Раунд закрывает регистрацию, постановку производства и коммерческий вывод — ключевые шаги к выручке.',
      risks: 'Регуляторные сроки регистрации, технологический перенос в производство, скорость принятия рынком. Часть рисков снижена выкупленным патентом и независимой оценкой.',
    },
    metrics: [
      { label: 'Раунд', value: formatMoney(p.raiseAmount, p.currency) },
      { label: 'Доля инвестору', value: formatPercent(p.equityOffered) },
      { label: 'Мин. чек', value: formatMoney(p.minCheck, p.currency) },
      { label: 'Стадия', value: 'MVP · научная база готова' },
      { label: 'Юр. структура', value: 'ООО «НеоГемовет»' },
      { label: 'IP', value: 'Патент + НИР выкуплены' },
    ],
    // Реальные материалы НеоГемовет (Sprint 62.P12) — прямые ссылки,
    // открываются в новой вкладке.
    publicMaterials: [
      { title: 'Тизер проекта', type: 'Тизер', size: 'PDF · Google Drive', description: 'Сделка на одной странице: суть, рынок, доля.', url: 'https://drive.google.com/file/d/1lw7iblJMbSuSMy2uqRinweVWbGh2nm76/view', locked: false },
      { title: 'Pitch Deck', type: 'Презентация', size: 'PDF · Google Drive', description: 'Продукт, рынок, технология и условия сделки.', url: 'https://drive.google.com/file/d/1ErDc8IPCI0hrbljPjnaYxiHkN_2B3Zh8/view', locked: false },
      { title: 'FAQ для инвестора', type: 'FAQ', size: 'Google Docs', description: 'Ответы на частые вопросы по сделке и IP.', url: 'https://docs.google.com/document/d/1LFjowOLPrTKa3Rzb61G_uyHkc918puam_rsEDdwKbbU/edit', locked: false },
    ],
    dataRoom: [
      { title: 'Финансовая модель', type: 'Финмодель', size: 'Google Sheets', description: 'План использования средств и структура раунда.', url: 'https://docs.google.com/spreadsheets/d/1F-8xtAk0tKn1uTHDfG8_uF4pBcdJSO4S/edit', locked: false },
      { title: 'Патент и результаты НИР', type: 'IP', size: 'PDF · пакет', description: 'Договоры выкупа у разработчиков, патентная заявка.', locked: true },
      { title: 'Независимая оценка стоимости', type: 'Оценка', size: 'PDF', description: 'Отчёт независимого оценщика по проекту.', locked: true },
      { title: 'Юридическая структура сделки (доля 25%)', type: 'Юр-структура', size: 'PDF · пакет', description: 'Корпоративная структура и условия входа.', locked: true },
      { title: 'Регуляторная дорожная карта', type: 'Регистрация', size: 'PDF', description: 'Этапы и сроки регистрации продукта.', locked: true },
      { title: 'Cap table и условия входа', type: 'Cap table', size: 'Excel', description: 'Структура владения до и после раунда.', locked: true },
    ],
  }),
  'Планета 60': (p) => ({
    cover: { gradient: GRAD.cosmic, icon: 'planet', accent: 'ai' },
  }),
  'Венский ветер': (p) => ({
    cover: { gradient: GRAD.teal, icon: 'wind', accent: 'ai' },
  }),
};

// ─── generic fallback ────────────────────────────────────────

function genericView(p: Project): OpportunityView {
  const { statusLabel, statusTone, scarcity } = statusFor(p);
  const stage = p.stage ? STAGE_LABELS[p.stage] ?? p.stage : null;
  const sector = p.industry ?? 'Инвестиционная возможность';

  const brief = p.brief ?? null;
  const summary = brief?.businessSummary?.trim() || null;
  const monetization = brief?.monetization?.trim() || null;
  const investmentAsk = brief?.investmentAsk?.trim() || null;
  const weaknesses = parseList(brief?.weaknesses);
  const km = parseObj<Record<string, unknown>>(brief?.keyMetrics, {});

  const shortThesis = summary
    ? truncate(summary, 180)
    : `Проект из сектора «${sector}». Раунд ${formatMoney(p.raiseAmount, p.currency)}, доля ${formatPercent(p.equityOffered)}.`;

  const metrics: OpportunityMetric[] = [
    { label: 'Раунд', value: formatMoney(p.raiseAmount, p.currency) },
    { label: 'Доля инвестору', value: formatPercent(p.equityOffered) },
    { label: 'Мин. чек', value: formatMoney(p.minCheck, p.currency) },
    ...(stage ? [{ label: 'Стадия', value: stage }] : []),
  ];
  for (const [k, v] of Object.entries(km)) {
    if (metrics.length >= 8) break;
    if (v == null || v === '') continue;
    metrics.push({ label: humanizeMetric(k), value: String(v) });
  }

  const highlights: string[] = [
    `Раунд ${formatMoney(p.raiseAmount, p.currency)} · доля ${formatPercent(p.equityOffered)}`,
    ...(stage ? [`Стадия: ${stage}`] : []),
    'Упаковано и проверено ZAPUSK AI',
  ].slice(0, 3);

  return {
    cover: genericCover(p),
    tagline: sector,
    sector,
    subtitle: summary ? truncate(summary, 120) : sector,
    shortThesis,
    statusLabel,
    statusTone,
    scarcity,
    upside: investmentAsk ? truncate(investmentAsk, 100) : 'Потенциал роста доли при развитии проекта',
    payback: null,
    badges: commonBadges(p),
    highlights,
    thesis: {
      whyInteresting: summary ?? 'Проект упакован ZAPUSK AI: понятная сделка, материалы и условия для инвестора.',
      howEarn: monetization ?? 'Инвестор входит в долю и зарабатывает на росте стоимости компании и распределении прибыли.',
      whyNow: investmentAsk ?? 'Открыт сбор заявок на текущий раунд привлечения.',
      risks: weaknesses.length ? weaknesses.slice(0, 3).join('; ') : 'Стандартные риски ранней стадии. Подробности — в data room после заявки.',
    },
    metrics,
    publicMaterials: [
      { title: 'Инвестиционная презентация', type: 'Презентация', size: 'Pitch deck', description: 'Суть проекта, рынок и условия сделки.', outputType: 'pitch_deck', locked: false },
      { title: 'Тизер / ванпейджер', type: 'Тизер', size: 'One-pager', description: 'Сделка на одной странице.', outputType: 'one_pager', locked: false },
      { title: 'Краткое финансовое резюме', type: 'Финансы', size: 'Сводка', description: 'Ключевые цифры и структура раунда.', outputType: 'financial_model', locked: false },
      { title: 'FAQ для инвестора', type: 'FAQ', size: 'Документ', description: 'Ответы на частые вопросы.', outputType: 'faq', locked: false },
    ],
    dataRoom: GENERIC_DATA_ROOM,
    dealSteps: DEAL_STEPS,
    legal: LEGAL,
  };
}

// ─── public builder ──────────────────────────────────────────

export function buildOpportunityView(p: Project): OpportunityView {
  const base = genericView(p);
  const curated = CURATED[p.name];
  if (!curated) return base;

  const { statusLabel, statusTone, scarcity } = statusFor(p);
  return {
    ...base,
    statusLabel,
    statusTone,
    scarcity,
    badges: commonBadges(p),
    dealSteps: DEAL_STEPS,
    legal: LEGAL,
    ...curated(p),
  };
}

// ─── helpers ─────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

const METRIC_LABELS: Record<string, string> = {
  mrr: 'MRR', arr: 'ARR', gmv: 'GMV', revenue: 'Выручка', users: 'Пользователи',
  customers: 'Клиенты', churn: 'Отток', margin: 'Маржа', ltv: 'LTV', cac: 'CAC',
};

function humanizeMetric(k: string): string {
  return METRIC_LABELS[k.toLowerCase()] ?? k.charAt(0).toUpperCase() + k.slice(1);
}
