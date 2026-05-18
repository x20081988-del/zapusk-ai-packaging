// Sprint 61.P1 — Fixed fixtures + seeding/cleanup helpers for retrieval benchmark.
// Чистый side-effect-free модуль. Импортируется из retrievalBenchmark.ts
// (CLI entry-point) и из retrievalBenchmarkDebug.ts.

import { prisma } from '../db.js';
import {
  ingestKnowledgeSource,
  type KnowledgeSourceType,
} from '../services/knowledgeService.js';

// ─── Fixed IDs ─────────────────────────────────────────────────────────────

export const BENCH_USER_ID    = 'bench-user-fixed';
export const BENCH_PROJECT_ID = 'bench-project-fixed';

// ─── Query categories ──────────────────────────────────────────────────────

export type QueryCategory =
  | 'finance_numeric'
  | 'finance_qualitative'
  | 'risk_objection'
  | 'team_pitch'
  | 'general_sales';

export interface Query {
  id: string;
  text: string;
  // Какие seed-IDs должны попасть в top-5. Порядок: первый — самый ожидаемый.
  expected: string[];
  category: QueryCategory;
}

interface SeedSource {
  id: string;
  scope: 'project' | 'global';
  sourceType: KnowledgeSourceType;
  title: string;
  text: string;
}

// ─── Seed dataset ──────────────────────────────────────────────────────────

export const SEED_SOURCES: SeedSource[] = [
  // ─── Project-scoped ─────────────────────────────────────────────────────
  {
    id: 'src-pitch-deck',
    scope: 'project',
    sourceType: 'project_presentation',
    title: '[pitch] BENCH_pitch_deck_2026Q2.pdf',
    text: `
Презентация Atlas Industrial Park.

Сеть промышленных парков под аренду логистике и легкому производству. Регионы ЦФО. 18 действующих арендаторов, средняя вакансия 6%.

Команда: Григорий Луцик (CEO, 12 лет опыта в коммерческой недвижимости), Анна Соловьёва (CFO, ex-DLFY), Дмитрий Карпов (директор по эксплуатации, ex-Главснаб).

Текущая стадия: scaling. Подписано 3 anchor-арендатора с длинными контрактами от 5 лет (X5 Retail Group, Wildberries, локальная логистика).

Существенный риск: 2 anchor-арендатора генерируют 47% выручки. План митигации — расширение портфеля до 25 арендаторов к концу 2026.

Уникальное преимущество: сервисная модель «парк под ключ» против чистой аренды у конкурентов. Включает охрану, клининг, ИТ-инфра, юридическое сопровождение.
    `.trim(),
  },
  {
    id: 'src-financial-model',
    scope: 'project',
    sourceType: 'financial_question',
    title: '[financial] BENCH_finmodel_v3.xlsx',
    text: `
Финансовая модель Atlas Industrial Park.

Лист "P&L Summary":
Выручка 2025: 280 млн RUB
Выручка 2026: 380 млн RUB
Выручка 2027: 520 млн RUB
Выручка 2028: 680 млн RUB

EBITDA 2025: 95 млн RUB
EBITDA 2026: 145 млн RUB
EBITDA 2027: 210 млн RUB

EBITDA margin 2027: 40.4 процента

Чистая прибыль 2025: 38 млн RUB
Чистая прибыль 2026: 65 млн RUB
Чистая прибыль 2027: 92 млн RUB
Чистая прибыль 2028: 128 млн RUB

Лист "Unit Economics":
Средняя площадь на арендатора: 850 квадратных метров
Средняя ставка: 1200 RUB за квадратный метр в месяц
Средний контракт: 36 месяцев
CAC: 180 000 RUB на нового арендатора
Сервисная маржа: 38 процентов

Лист "Use of Funds":
60 процентов строительство третьей очереди
25 процентов подключение коммуникаций (ЛЭП, газ, вода)
15 процентов оборотный капитал

Оценка проекта: 1 миллиард RUB pre-money
Доходность инвестора: IRR 25 процентов годовых
    `.trim(),
  },
  {
    id: 'src-objections-doc',
    scope: 'project',
    sourceType: 'objection',
    title: '[reference] BENCH_typical_objections.md',
    text: `
Типичные возражения инвесторов по Atlas Industrial Park.

Возражение «концентрация на 2 арендаторах».
Ответ: контракты на 5 лет с break-fee 6 месяцев аренды. Waiting-list на 4 альтернативных арендатора. Расширение портфеля до 25 контрагентов к концу 2026 года. Якорные арендаторы дают предсказуемый cash flow.

Возражение «не подключена ЛЭП».
Ответ: подключение через 4 месяца, договор с Россетями подписан, проектная документация согласована. Бюджет на подключение зашит в use of funds. ЛЭП-риск считаем закрытым.

Возражение «низкая доходность 25 процентов».
Ответ: это IRR на 5-летнем горизонте с учётом выкупа доли. Cash-on-cash доходность аренды — 14 процентов годовых, дополнительные 11 процентов за счёт капитализации.

Возражение «недвижимость на стройке слишком рискованно».
Ответ: две очереди уже сданы и генерируют выручку. Третья очередь имеет pre-let 35 процентов, escrow-механизм траншей по milestone, личное поручительство фаундера.
    `.trim(),
  },
  {
    id: 'src-technical-doc',
    scope: 'project',
    sourceType: 'project_presentation',
    title: '[description] BENCH_technical_description.docx',
    text: `
Техническое описание Atlas Industrial Park.

Общая площадь 22 гектара. Три очереди застройки. Класс A.

Очередь 1 (ввод 2024): 8 гектар, 6 зданий, 24 000 квадратных метров арендуемой площади. Заполнена на 94 процента.
Очередь 2 (ввод 2025): 7 гектар, 5 зданий, 22 000 квадратных метров. Заполнена на 78 процентов.
Очередь 3 (в стройке, ввод Q4 2026): 7 гектар, 6 зданий, 28 000 квадратных метров. Pre-let 35 процентов на текущий момент.

Инженерия: тепло — собственная котельная, газовая. Электроснабжение — переход с резервного на основное подключение к Россетям, 12 МВт мощности. Вода — городской водоканал плюс артезианская скважина.

Транспортная доступность: 18 километров от МКАД, выезд на трассу М-7, железнодорожная ветка на территории комплекса.

Стадия строительства третьей очереди — фундамент и каркас завершены, монтаж кровли в процессе.
    `.trim(),
  },
  // ─── Global sales KB ───────────────────────────────────────────────────
  {
    id: 'src-successful-sale',
    scope: 'global',
    sourceType: 'successful_sale',
    title: '[ZAPUSK KB] Successful close — private investor 50М',
    text: `
Успешная сделка: частный инвестор, чек 50 млн RUB.

Ключевые факторы успеха:
1. Открытый разговор про риск концентрации арендаторов на первом же звонке.
2. Демонстрация waiting-list реальных потенциальных арендаторов с контактами.
3. Структура сделки через выкуп доли, защита капитала через личное поручительство.
4. Доходность 22 процента годовых через комбинацию аренды и капитализации.

Инвестор зашёл после 3 встреч и due diligence по финансовой модели и юридическим документам.

Опыт применим к проектам коммерческой недвижимости со стабильной арендной базой.
    `.trim(),
  },
  {
    id: 'src-objection-general',
    scope: 'global',
    sourceType: 'objection',
    title: '[ZAPUSK KB] Объекция «слишком высокий риск девелопмента»',
    text: `
Типичная объекция инвестора: «недвижимость на стройке — это слишком рискованно для меня».

Эффективные ответы:
1. Делать акцент на готовых очередях, генерирующих cash flow.
2. Показывать конкретный график завершения строительства и pre-let контракты.
3. Предлагать структуру сделки с эскроу: деньги поступают траншами по мере достижения milestone.
4. Сравнивать с фондовым рынком: волатильность ниже, доходность сопоставима.

Не работает: лобовое отрицание риска, обещание гарантированной доходности.

Эта объекция типична для портфельных инвесторов со стажем более 5 лет.
    `.trim(),
  },
  {
    id: 'src-manager-script',
    scope: 'global',
    sourceType: 'manager_script',
    title: '[ZAPUSK KB] Скрипт открытия Zoom-встречи',
    text: `
Открытие Zoom-встречи с потенциальным инвестором.

Сначала 2 минуты small talk, чтобы снять напряжение.
Затем фраза «Я расскажу про проект, потом задам несколько вопросов про ваш опыт, потом обсудим формат, если интересно — материалы и следующий шаг».

Это даёт фаундеру контроль над структурой встречи и снимает у инвестора ожидание «сейчас будут впаривать».

Применимо к первым Zoom-встречам и quarterly-обновлениям с действующими инвесторами.
    `.trim(),
  },
];

export const QUERIES: Query[] = [
  {
    id: 'q-net-profit-2027',
    text: 'Какая чистая прибыль ожидается в 2027 году по финмодели?',
    expected: ['src-financial-model'],
    category: 'finance_numeric',
  },
  {
    id: 'q-ebitda-margin',
    text: 'Какая EBITDA маржа у вас на 2027?',
    expected: ['src-financial-model'],
    category: 'finance_numeric',
  },
  {
    id: 'q-cac',
    text: 'А что у вас с CAC и юнит-экономикой по новым арендаторам?',
    expected: ['src-financial-model'],
    category: 'finance_numeric',
  },
  {
    id: 'q-revenue-2026',
    text: 'Сколько выручки запланировано на 2026 год по модели?',
    expected: ['src-financial-model'],
    category: 'finance_numeric',
  },
  {
    id: 'q-valuation',
    text: 'Какая оценка проекта pre-money и доходность для инвестора?',
    expected: ['src-financial-model'],
    category: 'finance_qualitative',
  },
  {
    id: 'q-use-of-funds',
    text: 'На что пойдут привлечённые деньги? Use of funds?',
    expected: ['src-financial-model'],
    category: 'finance_qualitative',
  },
  {
    id: 'q-anchor-tenant-risk',
    text: 'Что произойдёт если ключевой anchor арендатор уйдёт?',
    expected: ['src-objections-doc', 'src-pitch-deck'],
    category: 'risk_objection',
  },
  {
    id: 'q-lep-connection',
    text: 'А когда у вас будет подключена ЛЭП Россети? Это критичный риск.',
    expected: ['src-objections-doc', 'src-technical-doc'],
    category: 'risk_objection',
  },
  {
    id: 'q-team',
    text: 'Расскажите про команду проекта, кто отвечает за финансы CFO?',
    expected: ['src-pitch-deck'],
    category: 'team_pitch',
  },
  {
    id: 'q-stage-construction',
    text: 'На какой стадии строительство третьей очереди сейчас?',
    expected: ['src-technical-doc', 'src-pitch-deck'],
    category: 'team_pitch',
  },
  {
    id: 'q-investor-objection-real-estate-risk',
    text: 'Мне кажется недвижимость на стройке — слишком высокий риск для моего портфеля',
    expected: ['src-objection-general', 'src-objections-doc'],
    category: 'general_sales',
  },
  {
    id: 'q-zoom-opening',
    text: 'Как лучше открыть встречу с новым инвестором по Zoom?',
    expected: ['src-manager-script'],
    category: 'general_sales',
  },
];

// ─── Lifecycle ─────────────────────────────────────────────────────────────

// Sprint 61.P1 — Isolation. Бенчмарк может работать на dev-БД, где уже
// есть demo-seed knowledge. Чтобы измерения были чистыми — на время прогона
// прячем все «не бенч» KnowledgeSource'ы под маркер `tagsJson` (стираем
// archivedAt поле НЕ трогаем — это слишком разрушительно). Используем
// технический трюк: меняем `status` с 'published' на 'disabled' и
// возвращаем в `restoreOthers`.

const BENCH_TITLE_MARKERS = [
  '[pitch] BENCH_',
  '[financial] BENCH_',
  '[reference] BENCH_',
  '[description] BENCH_',
  '[ZAPUSK KB] ', // наши синтетические global-источники
];

function isBenchSource(title: string): boolean {
  return BENCH_TITLE_MARKERS.some((m) => title.startsWith(m));
}

export interface IsolationState {
  hiddenSourceIds: string[];
}

export async function isolateOthers(): Promise<IsolationState> {
  const all = await prisma.knowledgeSource.findMany({
    where: { status: 'published', archivedAt: null },
    select: { id: true, title: true },
  });
  const toHide = all.filter((s) => !isBenchSource(s.title)).map((s) => s.id);
  if (toHide.length === 0) return { hiddenSourceIds: [] };
  await prisma.knowledgeSource.updateMany({
    where: { id: { in: toHide } },
    data: { status: 'disabled' },
  });
  return { hiddenSourceIds: toHide };
}

export async function restoreOthers(state: IsolationState): Promise<void> {
  if (state.hiddenSourceIds.length === 0) return;
  await prisma.knowledgeSource.updateMany({
    where: { id: { in: state.hiddenSourceIds } },
    data: { status: 'published' },
  });
}

export async function cleanup(): Promise<void> {
  const benchSources = await prisma.knowledgeSource.findMany({
    where: { OR: [
      { title: { startsWith: '[pitch] BENCH_' } },
      { title: { startsWith: '[financial] BENCH_' } },
      { title: { startsWith: '[reference] BENCH_' } },
      { title: { startsWith: '[description] BENCH_' } },
      { title: { startsWith: '[ZAPUSK KB] ' } },
    ]},
    select: { id: true },
  });
  if (benchSources.length > 0) {
    const ids = benchSources.map((s) => s.id);
    await prisma.knowledgeChunk.deleteMany({ where: { sourceId: { in: ids } } });
    await prisma.knowledgeSource.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.project.deleteMany({ where: { id: BENCH_PROJECT_ID } });
  await prisma.user.deleteMany({ where: { id: BENCH_USER_ID } });
}

export async function seed(): Promise<Map<string, string>> {
  await prisma.user.upsert({
    where: { id: BENCH_USER_ID },
    update: {},
    create: {
      id: BENCH_USER_ID,
      email: 'bench@local',
      name: 'BENCH user',
      role: 'FOUNDER',
    },
  });
  await prisma.project.upsert({
    where: { id: BENCH_PROJECT_ID },
    update: {},
    create: {
      id: BENCH_PROJECT_ID,
      userId: BENCH_USER_ID,
      name: 'BENCH Atlas Industrial Park',
      industry: 'real_estate',
      stage: 'scaling',
      raiseAmount: 120_000_000,
      currency: 'RUB',
      minCheck: 5_000_000,
      equityOffered: 12,
    },
  });

  const expectedToActual = new Map<string, string>();
  for (const s of SEED_SOURCES) {
    const out = await ingestKnowledgeSource({
      scope: s.scope,
      projectId: s.scope === 'project' ? BENCH_PROJECT_ID : null,
      title: s.title,
      sourceType: s.sourceType,
      status: 'published',
      visibility: 'internal',
      isCandidate: false,
      rawText: s.text,
      environment: 'production',
    });
    expectedToActual.set(s.id, out.sourceId);
  }
  return expectedToActual;
}
