// Sprint 62.P11 — Investor Opportunities as Crowdinvesting Showcase.
//
// Преобразует Project (бэкенд) в инвестор-facing view-model для витрины
// /opportunities и страницы /opportunities/:id. Никакой cockpit-терминологии:
// только то, что видит инвестор на краудинвестинговой площадке.
//
// Для двух главных демо-кейсов (Luce Silva, НеоГемовет) контент curated.
// Для остальных isDemo-проектов строим generic-view из полей проекта + брифа.

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

export interface OpportunityMaterial {
  title: string;
  type: string;
  description: string;
  /** true = открытый/тизерный материал; false = доступен после заявки. */
  available: boolean;
  /** Связка с PackagingJob.outputType — чтобы подтянуть previewUrl, если есть. */
  outputType?: string;
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
  sector: string;
  shortThesis: string;
  statusLabel: string;
  statusTone: BadgeTone;
  upside: string;
  payback: string | null;
  badges: OpportunityBadge[];
  // Detail-level
  subtitle: string;
  thesis: OpportunityThesis;
  metrics: OpportunityMetric[];
  publicMaterials: OpportunityMaterial[];
  dataRoom: string[];
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
// curated-кейсами).
const GENERIC_DATA_ROOM: string[] = [
  'Детальная финансовая модель (помесячно, со сценариями)',
  'Юридическая структура сделки и корпоративные документы',
  'Договоры и существенные контракты',
  'Подтверждающие документы и отчётность',
  'Исследование рынка и конкурентов',
  'Юнит-экономика и расчёты',
  'Cap table и структура владения',
  'Записи встреч и Q&A с фаундером',
];

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
  badges.push({ label: 'Сделка через платформу', tone: 'neutral' });
  badges.push({ label: 'Проверено ZAPUSK AI', tone: 'success' });
  return badges;
}

// ─── status ──────────────────────────────────────────────────

function statusFor(p: Project): { statusLabel: string; statusTone: BadgeTone } {
  if (p.status === 'ready') return { statusLabel: 'Открыт сбор заявок', statusTone: 'success' };
  if (p.status === 'packaging') return { statusLabel: 'Готовится к открытию', statusTone: 'ai' };
  return { statusLabel: 'На проверке', statusTone: 'neutral' };
}

// ─── curated cases ───────────────────────────────────────────

const CURATED: Record<string, (p: Project) => Partial<OpportunityView>> = {
  'Luce Silva': (p) => ({
    sector: 'Свадебный event · премиальная недвижимость',
    subtitle: 'Премиальная свадебная площадка — оранжерея в лесу с собственным кейтерингом',
    shortThesis: 'Премиальная свадебная площадка под Москвой: оранжерея в лесу, средний чек ~725 тыс ₽, прибыль ~500 тыс ₽ со свадьбы, 75–150 свадеб за сезон.',
    upside: 'Окупаемость 1–2 сезона, дивиденды до 70% прибыли до выхода на окупаемость',
    payback: '1–2 сезона',
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
      { title: 'Инвестиционная презентация', type: 'Презентация', description: 'Концепция площадки, экономика и условия сделки.', available: true, outputType: 'pitch_deck' },
      { title: 'Тизер / ванпейджер', type: 'Тизер', description: 'Сделка на одной странице: суть, цифры, доля.', available: true, outputType: 'one_pager' },
      { title: 'Краткое финансовое резюме', type: 'Финансы', description: 'Выручка, маржа и сценарии загрузки 75/100/150 свадеб.', available: true, outputType: 'financial_model' },
      { title: 'Посадочная страница проекта', type: 'Landing', description: 'Публичная страница с визуалом площадки.', available: true, outputType: 'landing' },
      { title: 'FAQ для инвестора', type: 'FAQ', description: 'Ответы на частые вопросы по сделке и доле.', available: true, outputType: 'faq' },
    ],
    dataRoom: [
      'Детальная финансовая модель: сценарии 75 / 100 / 150 свадеб за сезон',
      'Юридическая структура сделки и продажа доли ООО (49%)',
      'Договоры аренды/собственности на объект и обременения',
      'Управленческая отчётность и подтверждение выручки',
      'Юнит-экономика одной свадьбы и кейтеринга',
      'Cap table и условия дивидендной политики (до 70% до окупаемости)',
      'Записи встреч с фаундером и Q&A',
    ],
  }),
  'НеоГемовет': (p) => ({
    sector: 'Ветеринарная биофарма · искусственная кровь',
    subtitle: 'Ветеринарная биофарма — универсальный кровезаменитель для животных',
    shortThesis: 'Биофарма-проект: универсальный кровезаменитель (искусственная кровь) для ветеринарии. Куплены патент и НИР, раунд — на регистрацию, производство и вывод на рынок.',
    upside: 'Выход на регистрацию и производство; масштабируемый продукт с патентной защитой',
    payback: null,
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
    publicMaterials: [
      { title: 'Инвестиционная презентация', type: 'Презентация', description: 'Продукт, рынок, технология и условия сделки.', available: true, outputType: 'pitch_deck' },
      { title: 'Тизер / ванпейджер', type: 'Тизер', description: 'Сделка на одной странице: суть и доля.', available: true, outputType: 'one_pager' },
      { title: 'Краткое финансовое резюме', type: 'Финансы', description: 'Структура раунда: регистрация, производство, вывод.', available: true, outputType: 'financial_model' },
      { title: 'Резюме для инвестора (рынок)', type: 'Рынок', description: 'Оценка рынка ветеринарной биофармы.', available: true, outputType: 'investor_summary' },
      { title: 'FAQ для инвестора', type: 'FAQ', description: 'Ответы на частые вопросы по сделке и IP.', available: true, outputType: 'faq' },
    ],
    dataRoom: [
      'Детальная финансовая модель и план использования средств',
      'Патент и результаты НИР (договоры выкупа у разработчиков)',
      'Независимая оценка стоимости проекта',
      'Юридическая структура сделки (доля 25% в ООО)',
      'Регуляторная дорожная карта регистрации продукта',
      'Исследование рынка и конкурентов',
      'Cap table и условия входа инвестора',
      'Записи встреч с командой и Q&A',
    ],
  }),
};

// ─── generic fallback ────────────────────────────────────────

function genericView(p: Project): OpportunityView {
  const { statusLabel, statusTone } = statusFor(p);
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

  return {
    sector,
    subtitle: summary ? truncate(summary, 120) : sector,
    shortThesis,
    statusLabel,
    statusTone,
    upside: investmentAsk ? truncate(investmentAsk, 100) : 'Потенциал роста доли при развитии проекта',
    payback: null,
    badges: commonBadges(p),
    thesis: {
      whyInteresting: summary ?? 'Проект упакован ZAPUSK AI: понятная сделка, материалы и условия для инвестора.',
      howEarn: monetization ?? 'Инвестор входит в долю и зарабатывает на росте стоимости компании и распределении прибыли.',
      whyNow: investmentAsk ?? 'Открыт сбор заявок на текущий раунд привлечения.',
      risks: weaknesses.length ? weaknesses.slice(0, 3).join('; ') : 'Стандартные риски ранней стадии. Подробности — в data room после заявки.',
    },
    metrics,
    publicMaterials: [
      { title: 'Инвестиционная презентация', type: 'Презентация', description: 'Суть проекта, рынок и условия сделки.', available: true, outputType: 'pitch_deck' },
      { title: 'Тизер / ванпейджер', type: 'Тизер', description: 'Сделка на одной странице.', available: true, outputType: 'one_pager' },
      { title: 'Краткое финансовое резюме', type: 'Финансы', description: 'Ключевые цифры и структура раунда.', available: true, outputType: 'financial_model' },
      { title: 'FAQ для инвестора', type: 'FAQ', description: 'Ответы на частые вопросы.', available: true, outputType: 'faq' },
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

  const { statusLabel, statusTone } = statusFor(p);
  return {
    ...base,
    statusLabel,
    statusTone,
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
