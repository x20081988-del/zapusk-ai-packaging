import { prisma } from './db.js';
import { SEED_TEMPLATES } from './services/templateSeeds.js';
import {
  DEMO_PROJECTS,
  DEMO_NEGOTIATIONS,
  DEMO_MEETINGS,
  DEMO_PACKAGING_JOBS,
  type DemoProject,
} from './services/demoSeeds.js';

// Sprint 62.P3 — дополнительный список project IDs (НЕ name-based!), которые
// тоже нужно довести до Luce Silva showcase-состояния. Используется когда у
// founder'а есть собственный, customer-owned проект (isDemo=false), который
// он хочет показывать как demo. seedLuceSilvaShowcase запустится строго по
// этим ID после защитной проверки name='Luce Silva'.
//
// Внимание: это ПЕРЕЗАПИСЫВАЕТ реальные данные customer-проекта. Founder
// явно подтвердил, что он принимает изменение брифа, InvestorTerms и
// PackagingJob для каждого ID в этом списке.
const EXTRA_LUCE_SILVA_SHOWCASE_IDS: string[] = [
  'cmparw2i30002mbr7bnqv3g78',
];
import { env } from './env.js';
import { generateAllPrompts } from './services/promptBuilders.js';
import { resolveOrchestration } from './services/aiProviders.js';
import { hashPassword } from './authCrypto.js';
import { IS_PRODUCTION, seedLog as log } from './seedGuards.js';

// Sprint 29 — production seed чисто-upsert. Никаких deleteMany на user/project/
// invite/файлах/брифах/promptах/job'ах/sessions/reviews. Demo-проекты
// обновляются только по isDemo=true. Reset-режим (полный wipe) живёт в
// scripts/devReset.ts и отказывает в production через assertNotProduction().

// Sprint 56 / 57 P0 — known old realtime_transcription bodies that we
// auto-migrate to the latest verbatim prompt. Match must be EXACT (after
// trim) to avoid overwriting admin edits. Each entry corresponds to a
// previously-shipped seed body.
const OLD_REALTIME_BODIES = new Set<string>([
  // Sprint 49 hotfix 3 / Sprint 50 hotfix — vocabulary-heavy prompt that
  // biased gpt-4o-transcribe toward salesy paraphrasing.
  `Точная русская транскрипция переговоров инвестор↔фаундер для ZAPUSK AI. Английские термины — latin, не парафразируй, сохраняй пунктуацию и регистр имён.

Словарь (приоритет распознавания):
ZAPUSK AI, Zapusk, Запуск; DLFY, Delphi, Делфи; Главснаб, Glavsnab; Чио Чио, ChioChio; IRR, ROI, KPI, LTV, CAC, ARPU, MRR, ARR, P&L, NDA, MoM, YoY, B2B, B2C; SPIN, СПИН (ситуация, проблема, усиление, решение); pre-seed, seed, series A, серия А/Б, due diligence, term sheet; инвестор, чек, доля, capex, opex, окупаемость, доходность; упаковка проекта, финмодель, питч-дек, лендинг, one-pager, ванпейджер; акселератор, фонд, бизнес-ангел.

Не переводи бренды на русский (Zapusk ≠ «запуск», DLFY ≠ «делфи»). Не вставляй «[неразборчиво]» — лучше многоточие. Только транскрипция, без комментариев.`,
  // Sprint 56 — intermediate verbatim prompt (no dictionary, but no
  // explicit filler-word preservation). Sprint 57 strengthens the prompt
  // with ага/угу/эээ + stutter preservation — necessary for AI hesitation
  // signal downstream.
  `Точная дословная транскрипция русской речи.
Передавай ровно то, что произнесли — не парафразируй, не сокращай, не добавляй слов, которых не было в речи.

Никогда не «достраивай» фразу по смыслу и не угадывай продолжение. Если речь неразборчива — поставь многоточие или пропусти кусок. Лучше пробел, чем выдуманный текст.

Английские термины и латинские бренды (Zapusk, DLFY) оставляй на латинице. Кириллические бренды (Главснаб) — кириллицей.

Никаких комментариев, никакого мета-текста, никаких объяснений. Только дословная транскрипция произнесённого.`,
]);

async function main() {
  log('starting seed run');
  if (IS_PRODUCTION) {
    log('safe mode enabled — only upsert/update operations allowed');
    log('no destructive operations on real user data (User, Project, InviteToken, files, briefs, prompts, jobs, sessions, reviews)');
  }
  // Sprint 35 P0.1 — seed теперь create-if-missing, не upsert. Ручные правки
  // шаблонов в админке (body / name / active / provider / model / outputType)
  // НЕ перетираются повторным запуском seed. Иначе суперадмин редактирует
  // sales_gpt в админке, ловит deploy → правки откатываются к жёстко-заданным
  // SEED_TEMPLATES — это и есть тот риск, который мы закрываем.
  //
  // Future flag SEED_UPDATE_TEMPLATES=true можно ввести позже, если понадобится
  // force-обновление; в Sprint 35 он сознательно не реализован, чтобы не было
  // легального пути «случайно перетереть продакшен».
  log('seeding prompt templates (create-if-missing + null-orchestration backfill)...');
  for (const t of SEED_TEMPLATES) {
    const existing = await prisma.promptTemplate.findUnique({ where: { key: t.key } });
    const orch = resolveOrchestration(t.key);
    if (existing) {
      // Sprint 35 P0.1 — body/name/active/category/description никогда не
      // переписываем (могут быть ручные правки админа).
      // Sprint 51 hotfix P0.5 — но если provider/tool/outputType пусты
      // (template был засеен до появления orchestration), безопасно дозаливаем
      // их из TEMPLATE_ORCHESTRATION — это устраняет «инструмент не назначен»
      // в Super Admin без перетирания ручных правок. Не-null значения не
      // трогаем: админ мог сознательно переключить provider.
      if (orch) {
        const patch: Record<string, string> = {};
        if (!existing.provider && orch.provider) patch.provider = orch.provider;
        if (!existing.tool && orch.tool) patch.tool = orch.tool;
        if (!existing.outputType && orch.outputType) patch.outputType = orch.outputType;
        // model оставляем как есть: даже null валиден (route fallback'нется на env).
        if (Object.keys(patch).length > 0) {
          await prisma.promptTemplate.update({
            where: { key: t.key },
            data: patch,
          });
          console.log(`[seed] template orchestration backfilled: ${t.key} (${Object.keys(patch).join(', ')})`);
        }
      }

      // Sprint 56/57 P0 — one-shot conditional body migration for
      // realtime_transcription. Previous seeds biased the model toward
      // salesy output. Sprint 57 enforces strict verbatim + filler
      // preservation (ага/угу/эээ). We replace the body ONLY if it
      // exactly matches any previously-shipped seed (see OLD_REALTIME_BODIES
      // above). Admin edits stay untouched: a single byte difference
      // = skip migration, admin keeps control.
      if (t.key === 'realtime_transcription' && existing.body && OLD_REALTIME_BODIES.has(existing.body.trim())) {
        await prisma.promptTemplate.update({
          where: { key: t.key },
          data: { body: t.body },
        });
        console.log(`[seed] realtime_transcription body migrated to Sprint 57 strict-verbatim prompt`);
      }
      continue;
    }
    await prisma.promptTemplate.create({
      data: {
        ...t,
        active: true,
        ...(orch ? {
          provider: orch.provider,
          tool: orch.tool,
          model: orch.model,
          outputType: orch.outputType,
        } : {}),
      },
    });
    console.log(`[seed] template created: ${t.key}`);
  }

  console.log('[seed] upserting dev user...');
  // Sprint 22+25: dev user — ADMIN с workspaceStatus='active' (команда ZAPUSK AI).
  const user = await prisma.user.upsert({
    where: { email: env.DEV_USER_EMAIL.toLowerCase() },
    update: { workspaceStatus: 'active', role: 'ADMIN' },
    create: { email: env.DEV_USER_EMAIL.toLowerCase(), name: env.DEV_USER_NAME, workspaceStatus: 'active', role: 'ADMIN' },
  });

  // Sprint 22: backfill — все существующие пользователи получают active, если
  // ещё в дефолтном 'lead' (pre-Sprint-22). Sprint 35 P2: блокируем по
  // умолчанию — массовый apgrade lead→active в production может случайно
  // открыть доступ кому-то, кто намеренно остался в lead-стадии (например,
  // future-lead из CRM-импорта). Включается явным SEED_PROMOTE_LEADS=true
  // в случае, если backfill действительно нужен.
  if (process.env.SEED_PROMOTE_LEADS === 'true') {
    const updated = await prisma.user.updateMany({
      where: { workspaceStatus: 'lead' },
      data: { workspaceStatus: 'active' },
    });
    if (updated.count > 0) {
      console.log(`[seed] SEED_PROMOTE_LEADS=true — promoted ${updated.count} lead users to active`);
    }
  }

  // Sprint 25 — bootstrap accounts. Создаём 5 типовых пользователей платформы
  // (владелец, админ, менеджер, демо-фаундер, демо-инвестор). Пароли берём
  // из env: если empty → disabled account без passwordHash + warn в console.
  console.log('[seed] bootstrap accounts...');
  await upsertBootstrap({
    email: env.BOOTSTRAP_OWNER_EMAIL,
    name: 'Григорий · владелец платформы',
    role: 'SUPER_ADMIN',
    workspaceStatus: 'active',
    password: env.BOOTSTRAP_OWNER_PASSWORD,
    envVarName: 'BOOTSTRAP_OWNER_PASSWORD',
  });
  await upsertBootstrap({
    email: env.BOOTSTRAP_ADMIN_EMAIL,
    name: 'ZAPUSK AI Admin',
    role: 'ADMIN',
    workspaceStatus: 'active',
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
    envVarName: 'BOOTSTRAP_ADMIN_PASSWORD',
  });
  await upsertBootstrap({
    email: env.BOOTSTRAP_MANAGER_EMAIL,
    name: 'Менеджер ZAPUSK AI',
    role: 'MANAGER',
    workspaceStatus: 'active',
    password: env.BOOTSTRAP_MANAGER_PASSWORD,
    envVarName: 'BOOTSTRAP_MANAGER_PASSWORD',
  });
  await upsertBootstrap({
    email: env.BOOTSTRAP_DEMO_FOUNDER_EMAIL,
    name: 'Демо-фаундер',
    role: 'FOUNDER',
    workspaceStatus: 'demo',
    password: env.BOOTSTRAP_DEMO_PASSWORD,
    envVarName: 'BOOTSTRAP_DEMO_PASSWORD (demo-founder)',
  });
  await upsertBootstrap({
    email: env.BOOTSTRAP_DEMO_INVESTOR_EMAIL,
    name: 'Демо-инвестор',
    role: 'INVESTOR',
    workspaceStatus: 'demo',
    password: env.BOOTSTRAP_DEMO_PASSWORD,
    envVarName: 'BOOTSTRAP_DEMO_PASSWORD (demo-investor)',
  });

  console.log('[seed] seeding sample financial model template...');
  const existingModel = await prisma.financialModelTemplate.findFirst();
  if (!existingModel) {
    await prisma.financialModelTemplate.create({
      data: {
        name: 'Zapusk standard P&L + Investor Calculator',
        description: 'Базовая 5-летняя финмодель: assumptions, CAPEX, unit-econ, P&L, scenarios, investor return, valuation, dashboard, инвестиционный калькулятор',
        sheets: JSON.stringify([
          'Assumptions', 'CAPEX', 'Unit Economics', 'Seasonality',
          'P&L 36mo', 'Cash Flow', 'Scenario Analysis',
          'Investor Return', 'Valuation', 'Dashboard', 'Investor Calculator',
        ]),
      },
    });
  }

  log('seeding demo project "Венский ветер"...');
  // Sprint 29: demo-проекты обновляются только если они уже isDemo=true ИЛИ
  // принадлежат dev-user (исторический owner всех seed-проектов).
  // Это защищает реальные проекты с тем же name (маловероятно, но возможно).
  const demoExisting = await prisma.project.findFirst({
    where: { name: 'Венский ветер', userId: user.id, OR: [{ isDemo: true }, { userId: user.id }] },
  });
  const demo = demoExisting
    ? await prisma.project.update({
        where: { id: demoExisting.id },
        data: {
          inn: '7723123456',
          website: 'https://cafe-spb.ru',
          industry: 'Wedding venue · стеклянные оранжереи · кейтеринг премиум-сегмента',
          legalStatus: 'OOO',
          stage: 'early_revenue',
          raiseAmount: 66_000_000,
          currency: 'RUB',
          minCheck: 1_000_000,
          equityOffered: 49,
          raiseDeadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          investorType: 'private',
          status: 'packaging',
          // Sprint 24: глобальная демо-витрина — видна demo-пользователям.
          isDemo: true,
        },
      })
    : await prisma.project.create({
      data: {
        userId: user.id,
        name: 'Венский ветер',
        inn: '7723123456',
        website: 'https://cafe-spb.ru',
        industry: 'Wedding venue · стеклянные оранжереи · кейтеринг премиум-сегмента',
        legalStatus: 'OOO',
        stage: 'early_revenue',
        raiseAmount: 66_000_000,
        currency: 'RUB',
        minCheck: 1_000_000,
        equityOffered: 49,
        raiseDeadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // +60 days
        investorType: 'private',
        status: 'packaging',
        // Sprint 24: показывать в demo-витрине.
        isDemo: true,
      },
    });

  {
    // Pre-populate brief with realistic Zapusk-style data from the lesson example.
    // This way the demo opens with a meaningful cockpit, even without AI keys.
    const napkin = {
      whatIs: 'Свадебная площадка под Москвой формата стеклянной оранжереи на участке 1 га в 15 минутах от МКАД — премиум-сегмент. Полный цикл: площадка + кейтеринг + техника.',
      howMakesMoney: 'Средний чек одной свадьбы: 725 000 ₽ (аренда 250 + кейтеринг 400 + техника 75). Себестоимость 225 тыс. ₽, маржа с одного мероприятия — 500 тыс. ₽. Сезон: май-октябрь.',
      howMuchNeeded: '66 000 000 ₽ — CAPEX на 1 год до открытия первого сезона',
      whatFor: 'Аренда земли 5 млн · конструкция оранжереи 22 млн · инженерия 12 млн · кухня 10 млн · благоустройство 8 млн · домик/хозблок 6 млн · маркетинг 3 млн',
      investorReturn: 'Базовый сценарий (100 свадеб/сезон): инвестор 35 млн ₽ за сезон (70% прибыли до окупаемости), годовая доходность ~53%, окупаемость 2 сезона. Совокупный возврат за 3 года ~257 млн ₽ (x4 от вложений).',
      whyNow: 'Премиум-сегмент свадеб в РФ растёт — в Москве дефицит площадок формата на природе с собственной инфраструктурой. Открытие в апреле даёт полный первый сезон с конверсией бронирований с осени.',
      mainRisks: [
        'Сезонность — основная выручка в 6 месяцев (май-октябрь)',
        'Зависимость от bookings — нужны продажи ещё до открытия',
        'Зависимость от двух-трёх ключевых event-агентств',
      ],
      whatIsHidden: [
        'Конкретная экономика кейтеринга и его маржинальность',
        'Загрузка после первого сезона (повторные мероприятия, дни рождения, корпоративы)',
        'Точная стоимость аренды земли долгосрочно',
      ],
    };

    const existingBrief = await prisma.projectBrief.findUnique({ where: { projectId: demo.id } });
    const briefData = {
        version: existingBrief ? existingBrief.version : 1,
        businessSummary:
          'Венский ветер — премиум-площадка для свадеб формата стеклянной оранжереи на участке 1 га под Москвой (15 минут от МКАД). Концепция: площадка под открытым небом круглый год + собственный кейтеринг + полное событийное оснащение. Целевая аудитория — премиум-свадьбы с чеком от 500 тыс. ₽.',
        monetization:
          'Подмодели в одном чеке: аренда площадки 250 тыс. ₽ + кейтеринг 400 тыс. ₽ + техника 75 тыс. ₽. Средний чек одной свадьбы 725 тыс. ₽, операционная прибыль 500 тыс. ₽ (маржа ~69%). Сезон: 6 месяцев, май–октябрь.',
        keyMetrics: JSON.stringify({
          revenue: 'Бронирования открываются с момента начала строительства',
          growth: 'Целевая модель — рост от 75 свадеб (минимум) к 150 (максимум) к 3-му сезону',
          unit_econ: 'LTV / CAC не применимо в чистом виде, но средний чек 725 тыс. при себестоимости 225 тыс.',
          customers: '0 → 75–150 свадеб за сезон',
          margin: '~69% операционная маржа с мероприятия',
        }),
        investmentAsk:
          'Привлекается 66 млн ₽ на 12 месяцев под CAPEX до запуска первого сезона. Доля инвестора 49%. До окупаемости инвестору направляется 70% чистой прибыли, далее — pro-rata 49%. Минимальный чек 1 млн ₽.',
        strengths: JSON.stringify([
          'Понятная экономика: 500 тыс. ₽ маржи с одного мероприятия проверяется на каждой сделке',
          'Премиум-ниша с высоким средним чеком и низкой конкуренцией формата',
          'Окупаемость в базовом сценарии 2 сезона — короткий горизонт для инвестора',
          'Чёткая механика возврата: 70% прибыли инвестору до окупаемости',
          'Опытная команда — операторы кейтеринга с собственной кухней',
        ]),
        weaknesses: JSON.stringify([
          'Сезонность — 6 месяцев активной выручки, нужна стратегия зимней загрузки',
          'Высокий CAPEX на запуск — риск задержки открытия первого сезона',
          'Не раскрыта пайплайн-воронка предзаказа на сезон',
          'Не подтверждена долгосрочная аренда участка',
        ]),
        missingData: JSON.stringify([
          'Какая воронка предзаказа? Сколько LOI и аванса собрано до начала строительства?',
          'На какой срок зафиксирована аренда земли и какова ставка после первого периода?',
          'Зимняя загрузка: какие форматы (корпоративы, фотосессии) и какая доля в годовой выручке?',
          'Какие event-агентства уже подтвердили партнёрство и под какой объём бронирований?',
          'Точная себестоимость кейтеринга по сегментам блюд (сейчас усреднённо)',
        ]),
        interviewAnswers: null,
        napkin: JSON.stringify(napkin),
    } as const;
    await prisma.projectBrief.upsert({
      where: { projectId: demo.id },
      update: briefData,
      create: { projectId: demo.id, ...briefData },
    });

    const existingNapkinDoc = await prisma.generatedDocument.findFirst({
      where: { projectId: demo.id, kind: 'napkin' },
      orderBy: { version: 'desc' },
    });
    if (!existingNapkinDoc) {
      await prisma.generatedDocument.create({
        data: {
          projectId: demo.id,
          kind: 'napkin',
          version: 1,
          format: 'json',
          title: 'Бизнес на салфетке v1',
          body: JSON.stringify(napkin, null, 2),
        },
      });
    }

    console.log('[seed] generating prompts for demo...');
    try {
      // Generate fresh prompts from the (now richer) brief and the updated templates.
      // We deliberately do NOT call generateBrief here — the seed brief is the source of truth for demo.
      // Sprint 62.P5 — skipDispatch:true: seed never dispatches to Anthropic
      // / Lovable / Claude Design. Packaging jobs are created in
      // 'awaiting_manager' status, eliminating the bad_request_error log
      // noise and expensive LLM calls on every deploy. Managers complete
      // jobs via the normal /manager flow; showcase seeds (Luce Silva) then
      // bulk-mark them succeeded via seedLuceSilvaShowcase.
      await generateAllPrompts(demo.id, { skipDispatch: true });
    } catch (err) {
      console.warn('[seed] demo prompt generation skipped:', err instanceof Error ? err.message : err);
    }
  }

  // Sprint 3 — additional archetype demos
  for (const d of DEMO_PROJECTS) {
    await seedDemoArchetype(user.id, d);
  }

  // Sprint 62.P3 — apply showcase state to additional customer-owned project
  // IDs (founder explicitly approved). Defensive: name must match 'Luce Silva'.
  for (const id of EXTRA_LUCE_SILVA_SHOWCASE_IDS) {
    try {
      const proj = await prisma.project.findUnique({ where: { id } });
      if (!proj) {
        log(`extra showcase ID not found, skipping: ${id}`);
        continue;
      }
      if (proj.name !== 'Luce Silva') {
        log(`extra showcase ID ${id} has wrong name "${proj.name}" — skipping (expected «Luce Silva»)`);
        continue;
      }
      log(`applying Luce Silva showcase to extra project id=${id} (isDemo=${proj.isDemo})...`);
      await seedLuceSilvaShowcase(id);
      log(`applied Luce Silva showcase to ${id}`);
    } catch (err) {
      console.warn(`[seed] extra showcase ${id} skipped:`, err instanceof Error ? err.message : err);
    }
  }

  // Sprint 62.P10 — демо AI-переговоры (разборы + встречи) для демо-фаундера.
  await seedDemoNegotiations();

  // Sprint 62.P11 — готовые материалы упаковки (PackagingJob) для showcase-проектов.
  await seedDemoPackagingJobs();

  // Sprint 62.P11 — пара демо-заявок инвесторов с витрины /opportunities,
  // чтобы demo AI-leads показывал реальный поток заявок без ручного сабмита.
  await seedDemoInvestorApplications();

  log('done.');
}

// Sprint 62.P11 — идемпотентно сеет 1-2 демо-заявки инвестора на showcase-проекты.
// Эти заявки (isDemo=true) подмешиваются в /api/ai-leads/showcase как лид-карточки.
// Дедуп по (projectId, name) — повторный seed не плодит дубли.
const DEMO_INVESTOR_APPLICATIONS: Array<{
  projectName: string;
  name: string;
  contact: string;
  email?: string;
  checkRange: string;
  interest: string;
  comment?: string;
}> = [
  {
    projectName: 'Luce Silva',
    name: 'Инвестор с витрины · М.',
    contact: 'Telegram: @investor_demo',
    checkRange: '1m_3m',
    interest: 'materials',
    comment: 'Интересует формат участия и сезонная окупаемость. Прошу прислать пакет материалов.',
  },
  {
    projectName: 'НеоГемовет',
    name: 'Инвестор с витрины · К.',
    contact: '+7 900 000-00-00',
    checkRange: '3m_10m',
    interest: 'discuss',
    comment: 'Хочу обсудить долю и структуру сделки, а также получить доступ к data room.',
  },
];

async function seedDemoInvestorApplications(): Promise<void> {
  for (const app of DEMO_INVESTOR_APPLICATIONS) {
    const project = await prisma.project.findFirst({
      where: { name: app.projectName, isDemo: true, archivedAt: null },
      select: { id: true },
    });
    if (!project) continue;

    const existing = await prisma.investorApplication.findFirst({
      where: { projectId: project.id, name: app.name },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.investorApplication.create({
      data: {
        projectId: project.id,
        name: app.name,
        contact: app.contact,
        email: app.email ?? null,
        checkRange: app.checkRange,
        interest: app.interest,
        comment: app.comment ?? null,
        source: 'opportunities',
        status: 'demo_new',
        isDemo: true,
      },
    });
    log(`  + demo investor application for ${app.projectName}`);
  }
}

// Sprint 62.P11 — наполняет блок «Материалы проекта от ZAPUSK AI»
// (AIPackagingHistory) готовыми артефактами для всех showcase-проектов.
// Project-scoped (не createdById), поэтому виден владельцу, demo-инвестору
// (через assertCanReadProject) и admin/manager. Идемпотентно: дедуп по
// (projectId, outputType) среди succeeded-задач — не плодит дубли на
// проектах, которые свой seed уже наполнил succeeded-материалами.
//
// generateAllPrompts(skipDispatch:true) создаёт пачку awaiting_manager-задач
// на каждый showcase-проект при первом seed'е (Sprint 62.P12: теперь
// идемпотентно — дедуп по (projectId, templateKey), повторный seed не плодит
// строки). Из-за свежего createdAt они всплывают наверх ленты и
// блок «Материалы проекта» выглядит как «всё ещё готовится» (+ баннер про
// долгий лендинг), хотя showcase должен быть готов. Поэтому: (1) сначала
// создаём curated-набор (дедуп пропускает проекты, где succeeded того же
// outputType уже есть), затем (2) «дозакрываем» оставшиеся active-задачи всех
// showcase-проектов в succeeded с отодвинутым в прошлое createdAt — чтобы блок
// выглядел готовым, а curated-материалы оставались наверху ленты.
const SHOWCASE_FLIP_TO_READY = ['Luce Silva', 'Венский ветер', 'Планета 60', 'НеоГемовет'];

async function seedDemoPackagingJobs(): Promise<void> {
  log('seeding demo packaging jobs (ready materials)...');
  const now = Date.now();

  // 1) Curated-материалы с богатым preview/ссылками. Дедуп: пропускаем, если
  //    уже есть succeeded-job того же outputType. createdAt — недавнее
  //    прошлое, разнесённое offset'ом, чтобы curated оказались наверху ленты.
  let offset = 0;
  for (const job of DEMO_PACKAGING_JOBS) {
    const project = await prisma.project.findFirst({
      where: { name: job.projectName, isDemo: true, archivedAt: null },
      select: { id: true },
    });
    if (!project) {
      log(`demo packaging job: project "${job.projectName}" not found, skipping`);
      continue;
    }
    const existing = await prisma.packagingJob.findFirst({
      where: { projectId: project.id, outputType: job.outputType, status: 'succeeded' },
      select: { id: true },
    });
    if (existing) continue;
    offset += 1;
    const completedAt = new Date(now - offset * 36 * 60 * 1000);
    await prisma.packagingJob.create({
      data: {
        projectId: project.id,
        templateKey: job.templateKey,
        provider: job.provider,
        tool: job.tool,
        model: job.model,
        outputType: job.outputType,
        status: 'succeeded',
        prompt: `demo-seed · ${job.projectName} · ${job.outputType}`,
        resultPreview: job.resultPreview,
        managerComment: job.managerComment,
        previewUrl: job.previewUrl,
        completedBy: 'команда ZAPUSK AI',
        completedAt,
        createdAt: completedAt,
      },
    });
  }

  // 2) Дозакрываем «висящие» active-задачи showcase-проектов в succeeded и
  //    отодвигаем createdAt в прошлое, чтобы curated-материалы (шаг 1)
  //    оставались наверху. Применяем точечно (НеоГемовет) — проекты, уже
  //    наполненные succeeded-материалами своим seed'ом, не трогаем.
  const flippedAt = new Date(now - 2 * 24 * 60 * 60 * 1000);
  for (const name of SHOWCASE_FLIP_TO_READY) {
    const project = await prisma.project.findFirst({
      where: { name, isDemo: true, archivedAt: null },
      select: { id: true },
    });
    if (!project) {
      log(`flip-to-ready: project "${name}" not found, skipping`);
      continue;
    }
    const flipped = await prisma.packagingJob.updateMany({
      where: {
        projectId: project.id,
        status: { in: ['awaiting_manager', 'queued', 'running', 'mock'] },
      },
      data: {
        status: 'succeeded',
        completedBy: 'команда ZAPUSK AI',
        completedAt: flippedAt,
        createdAt: flippedAt,
      },
    });
    if (flipped.count > 0) log(`flip-to-ready: marked ${flipped.count} jobs succeeded for "${name}"`);
  }
}

// Sprint 62.P10 — заполняет «AI-разбор переговоров» (ConversationAnalysis) и
// «Встречи» (SalesSession) демо-контентом, привязанным к демо-проектам и
// видимым демо-фаундеру (createdById). Идемпотентно: пропускает запись, если
// уже есть строка с тем же (projectId, createdById, investorName).
async function seedDemoNegotiations(): Promise<void> {
  const founder = await prisma.user.findUnique({
    where: { email: env.BOOTSTRAP_DEMO_FOUNDER_EMAIL },
    select: { id: true },
  });
  if (!founder) {
    log('demo founder not found, skipping demo negotiations');
    return;
  }

  async function demoProjectIdByName(name: string): Promise<string | null> {
    const proj = await prisma.project.findFirst({
      where: { name, isDemo: true, archivedAt: null },
      select: { id: true },
    });
    return proj?.id ?? null;
  }

  log('seeding demo AI conversation analyses...');
  for (const n of DEMO_NEGOTIATIONS) {
    const projectId = await demoProjectIdByName(n.projectName);
    if (!projectId) {
      log(`demo negotiation: project "${n.projectName}" not found, skipping`);
      continue;
    }
    const existing = await prisma.conversationAnalysis.findFirst({
      where: { projectId, createdById: founder.id, investorName: n.investorName, archivedAt: null },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.conversationAnalysis.create({
      data: {
        projectId,
        createdById: founder.id,
        investorName: n.investorName,
        source: 'paste',
        transcript: n.transcript,
        transcriptDurationSec: n.durationSec,
        analysis: JSON.stringify(n.card),
        aiScore: n.card.aiScore,
        probabilityScore: n.card.probabilityScore,
        sentiment: n.card.sentiment,
        spinStage: n.card.spinStage,
        aiProvider: 'mock',
        aiModel: 'demo-seed',
        fellBackToMock: true,
      },
    });
  }

  log('seeding demo sales sessions (meetings)...');
  for (const m of DEMO_MEETINGS) {
    const projectId = await demoProjectIdByName(m.projectName);
    if (!projectId) {
      log(`demo meeting: project "${m.projectName}" not found, skipping`);
      continue;
    }
    const existing = await prisma.salesSession.findFirst({
      where: { projectId, createdById: founder.id, investorName: m.investorName, archivedAt: null },
      select: { id: true },
    });
    if (existing) continue;
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - m.durationMin * 60 * 1000);
    await prisma.salesSession.create({
      data: {
        projectId,
        createdById: founder.id,
        investorName: m.investorName,
        investorPhone: m.investorPhone,
        source: 'manual',
        startedAt,
        endedAt,
        transcript: m.transcript,
        summary: m.summary,
        investorInterest: m.investorInterest,
        checkRange: m.checkRange,
        objections: JSON.stringify(m.objections),
        risks: JSON.stringify(m.risks),
        materialsToSend: JSON.stringify(m.materialsToSend),
        nextStep: m.nextStep,
        followUpMessage: m.followUpMessage,
        probabilityScore: m.probabilityScore,
        investorType: m.investorType,
        tone: m.tone,
        outcome: m.outcome,
        aiProvider: 'mock',
        aiModel: 'demo-seed',
        fellBackToMock: true,
        transcriptSource: 'manual',
        transcriptQualityStatus: 'clean',
        aiDerivedFrom: 'clean',
      },
    });
  }
}

async function seedDemoArchetype(userId: string, d: DemoProject) {
  log(`seeding archetype "${d.name}"...`);
  const projectData = {
    inn: d.inn,
    website: d.website,
    industry: d.industry,
    legalStatus: d.legalStatus,
    stage: d.stage,
    raiseAmount: d.raiseAmount,
    currency: d.currency,
    minCheck: d.minCheck,
    equityOffered: d.equityOffered,
    investorType: d.investorType,
    status: d.status,
    raiseDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    // Sprint 24: все archetypes (Luce Silva, Планета 60, и т.д.) — это
    // глобальные демо-витрины для demo пользователей.
    isDemo: true,
  };
  // Sprint 29: archetype project обновляется ТОЛЬКО если он demo (isDemo=true)
  // или принадлежит dev-owner. Защита от случайного override реального проекта
  // с тем же именем.
  const existing = await prisma.project.findFirst({
    where: { name: d.name, userId, OR: [{ isDemo: true }, { userId }] },
  });
  if (existing && !existing.isDemo) {
    log(`refusing to update non-demo project "${d.name}" (userId=${userId})`);
    return;
  }
  const project = existing
    ? await prisma.project.update({ where: { id: existing.id }, data: projectData })
    : await prisma.project.create({ data: { userId, name: d.name, ...projectData } });

  const briefData = {
    businessSummary: d.brief.businessSummary,
    monetization: d.brief.monetization,
    keyMetrics: JSON.stringify(d.brief.keyMetrics),
    investmentAsk: d.brief.investmentAsk,
    strengths: JSON.stringify(d.brief.strengths),
    weaknesses: JSON.stringify(d.brief.weaknesses),
    missingData: JSON.stringify(d.brief.missingData),
    missingByCategory: JSON.stringify(d.brief.missingByCategory),
    interviewAnswers: null,
    napkin: JSON.stringify(d.brief.napkin),
  };
  const existingBrief = await prisma.projectBrief.findUnique({ where: { projectId: project.id } });
  await prisma.projectBrief.upsert({
    where: { projectId: project.id },
    update: { ...briefData, version: existingBrief?.version ?? 1 },
    create: { projectId: project.id, version: 1, ...briefData },
  });

  const existingNapkinDoc = await prisma.generatedDocument.findFirst({
    where: { projectId: project.id, kind: 'napkin' },
  });
  if (!existingNapkinDoc) {
    await prisma.generatedDocument.create({
      data: {
        projectId: project.id,
        kind: 'napkin',
        version: 1,
        format: 'json',
        title: `Бизнес на салфетке · ${d.name}`,
        body: JSON.stringify(d.brief.napkin, null, 2),
      },
    });
  }

  try {
    // Sprint 62.P5 — same skipDispatch as the Венский ветер demo above.
    // Prevents bad_request_error spam for financial / calculator_spec
    // (Claude-orchestrated templates) on every seed run.
    await generateAllPrompts(project.id, { skipDispatch: true });
  } catch (err) {
    console.warn(`[seed] prompts for ${d.name} skipped:`, err instanceof Error ? err.message : err);
  }

  // Sprint 62.P3 demo showcase — Luce Silva — выводим этот demo-проект в
  // состояние «полностью упакованного showcase»: все packaging-задачи
  // закрыты командой ZAPUSK AI, brief'у заполнены все категории, юр.
  // упаковка отмечена как готовая, заведены условия сделки. AI-лиды
  // НЕ запускаются автоматически — UI должен показывать «Готов к запуску
  // AI-лидов» (это next-step). Защита isDemo=true: для clients-проектов
  // с тем же именем upgrade не сработает (см. ранний refusal-check).
  if (d.name === 'Luce Silva') {
    try {
      await seedLuceSilvaShowcase(project.id);
    } catch (err) {
      console.warn(`[seed] luce silva showcase upgrade failed:`, err instanceof Error ? err.message : err);
    }
  }
}

// Sprint 62.P3 demo showcase upgrade. Idempotent: повторный seed просто
// перепишет статусы — состояние «всё готово» восстанавливается на каждом
// deploy. Никаких deletes; только updates / inserts с защитой от дублей.
async function seedLuceSilvaShowcase(projectId: string): Promise<void> {
  // 1) Project-level: status='ready' + investmentTrack 'llc_share' (чтобы
  //    в журней появились все 6 этапов, включая legal с правильными items).
  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'ready',
      investmentTrack: 'llc_share',
    },
  });

  // 2) Brief: очищаем missingData / missingByCategory + добавляем
  //    interviewAnswers. Если brief'а ещё нет (например, customer-проект
  //    в draft-состоянии) — создаём его из DEMO_PROJECTS Luce Silva
  //    данных (демо-бизнес-контент).
  const cleanedMissingByCategory = {
    financial: [], market: [], team: [], deal: [], unit_econ: [], risks: [],
  };
  const interviewAnswersJson = JSON.stringify([
    { question: 'Подтверждённые бронирования на первый сезон?', answer: 'Зафиксировано 12 предзаказов; цель — 50 к открытию сезона.', category: 'finance', savedAt: new Date().toISOString() },
    { question: 'Партнёрства с event-агентствами', answer: 'Подписаны соглашения о намерениях с 4 ключевыми event-агентствами Москвы.', category: 'market', savedAt: new Date().toISOString() },
    { question: 'Структура сделки и владения', answer: 'ООО с распределением долей 51/49, корпоративное соглашение готово.', category: 'deal', savedAt: new Date().toISOString() },
    { question: 'CAPEX-смета и календарь оплат', answer: 'Детальная смета 66 млн ₽ согласована, оплаты по этапам строительства.', category: 'finance', savedAt: new Date().toISOString() },
    { question: 'Команда операционного управления', answer: 'Шеф-повар, event-директор, sales-менеджер и админ — закреплены.', category: 'team', savedAt: new Date().toISOString() },
  ]);
  const luceDemoBrief = DEMO_PROJECTS.find((p) => p.name === 'Luce Silva')?.brief;
  await prisma.projectBrief.upsert({
    where: { projectId },
    update: {
      missingData: JSON.stringify([]),
      missingByCategory: JSON.stringify(cleanedMissingByCategory),
      interviewAnswers: interviewAnswersJson,
    },
    create: {
      projectId,
      version: 1,
      businessSummary: luceDemoBrief?.businessSummary ?? 'Luce Silva — премиальная стеклянная оранжерея для свадеб.',
      monetization: luceDemoBrief?.monetization ?? 'Средний чек около 725 тыс. ₽, прибыль с одной свадьбы около 500 тыс. ₽.',
      keyMetrics: JSON.stringify(luceDemoBrief?.keyMetrics ?? {}),
      investmentAsk: luceDemoBrief?.investmentAsk ?? '66 млн ₽ за 49%.',
      strengths: JSON.stringify(luceDemoBrief?.strengths ?? []),
      weaknesses: JSON.stringify(luceDemoBrief?.weaknesses ?? []),
      missingData: JSON.stringify([]),
      missingByCategory: JSON.stringify(cleanedMissingByCategory),
      interviewAnswers: interviewAnswersJson,
      napkin: JSON.stringify(luceDemoBrief?.napkin ?? {}),
    },
  });

  // 3) InvestorTerms: финальные условия сделки (видны в карточке проекта
  //    и в инвестиционном предложении).
  await prisma.investorTerms.upsert({
    where: { projectId },
    create: {
      projectId,
      amount: 66_000_000,
      equityPercent: 49,
      valuation: 135_000_000,
      instrument: 'equity',
      useOfFunds: 'Площадка и конструкции (40%), кухня и инженерия (25%), благоустройство (15%), маркетинг и продажи (15%), резерв (5%)',
      exitStrategy: 'Дивиденды до 70% прибыли до окупаемости, далее дивидендная модель + опция выкупа доли через 3 сезона.',
      expectedReturn: 'Целевой возврат x4 за 3 сезона при базовой загрузке.',
      payback: '1-2 сезона',
    },
    update: {
      amount: 66_000_000,
      equityPercent: 49,
      valuation: 135_000_000,
      instrument: 'equity',
      useOfFunds: 'Площадка и конструкции (40%), кухня и инженерия (25%), благоустройство (15%), маркетинг и продажи (15%), резерв (5%)',
      exitStrategy: 'Дивиденды до 70% прибыли до окупаемости, далее дивидендная модель + опция выкупа доли через 3 сезона.',
      expectedReturn: 'Целевой возврат x4 за 3 сезона при базовой загрузке.',
      payback: '1-2 сезона',
    },
  });

  // 4) PackagingJobs: помечаем все существующие задачи проекта как
  //    «succeeded + completedBy», чтобы UI журней показывал «готово».
  //    completedBy = «Команда ZAPUSK AI» — UI это видит как закрытую задачу.
  await prisma.packagingJob.updateMany({
    where: { projectId },
    data: {
      status: 'succeeded',
      completedBy: 'Команда ZAPUSK AI',
      completedAt: new Date(),
    },
  });

  // 4b) Stub-PackagingJobs для outputTypes, которых нет в проекте. Без них
  //     UI buildPackagingStage показывает item «не_начато». Создаём
  //     минимальные succeeded-jobs с осмысленным resultPreview для каждого
  //     отсутствующего outputType, который ожидает journey UI.
  const requiredOutputTypes: Array<{ outputType: string; templateKey: string; preview: string }> = [
    { outputType: 'pitch_deck', templateKey: 'showcase.pitch_deck', preview: 'Инвестиционная презентация (PDF) собрана командой ZAPUSK AI.' },
    { outputType: 'pitch_structure', templateKey: 'showcase.pitch_structure', preview: 'Структура слайдов инвестиционной презентации согласована.' },
    { outputType: 'financial_model', templateKey: 'showcase.financial_model', preview: 'Финансовая модель (XLSX) — три сценария загрузки, окупаемость 1-2 сезона.' },
    { outputType: 'calculator', templateKey: 'showcase.calculator', preview: 'Инвестиционный калькулятор готов: чек → доходность → срок возврата.' },
    { outputType: 'landing', templateKey: 'showcase.landing', preview: 'Посадочная страница проекта опубликована.' },
    { outputType: 'one_pager', templateKey: 'showcase.one_pager', preview: 'Ванпейджер для рассылки инвестору собран.' },
    { outputType: 'faq', templateKey: 'showcase.faq', preview: 'FAQ инвестора — 12 вопросов с ответами.' },
    { outputType: 'ai_visibility_report', templateKey: 'showcase.ai_visibility', preview: 'AI Discoverability отчёт: проект готов к поиску инвесторами через AI-каналы.' },
  ];
  const existingJobs = await prisma.packagingJob.findMany({
    where: { projectId },
    select: { outputType: true },
  });
  const existingOutputTypes = new Set(existingJobs.map((j) => j.outputType));
  for (const job of requiredOutputTypes) {
    if (existingOutputTypes.has(job.outputType)) continue;
    await prisma.packagingJob.create({
      data: {
        projectId,
        templateKey: job.templateKey,
        provider: 'mock',
        tool: 'showcase',
        outputType: job.outputType,
        status: 'succeeded',
        prompt: 'Demo showcase placeholder (Sprint 62.P3).',
        resultPreview: job.preview,
        completedBy: 'Команда ZAPUSK AI',
        completedAt: new Date(),
      },
    });
  }

  // 5) Legal artefactReviews: создаём approved-отзывы для items
  //    юридической упаковки. UI buildLegalStage (Sprint 62.P3) использует
  //    их, чтобы маркировать items как «готово».
  const legalItemKeys = ['legal_structure', 'llc_agreement', 'sale_contracts', 'legal_dd'];
  for (const itemKey of legalItemKeys) {
    const existing = await prisma.artefactReview.findFirst({
      where: { projectId, artefactKind: 'legal', artefactKey: itemKey },
    });
    const reviewData = {
      artefactKind: 'legal',
      artefactKey: itemKey,
      artefactId: null,
      score: 5,
      comment: 'Юридический блок подготовлен и подтверждён командой Zapusk AI.',
      approved: true,
      needsRework: false,
      reviewer: 'Команда ZAPUSK AI',
    };
    if (existing) {
      await prisma.artefactReview.update({
        where: { id: existing.id },
        data: { ...reviewData, archivedAt: null },
      });
    } else {
      await prisma.artefactReview.create({
        data: { projectId, ...reviewData },
      });
    }
  }

  // 6) Brief artefact review — отметить сам brief как принятый.
  const existingBriefReview = await prisma.artefactReview.findFirst({
    where: { projectId, artefactKind: 'brief', artefactKey: 'brief' },
  });
  const briefReviewData = {
    artefactKind: 'brief',
    artefactKey: 'brief',
    artefactId: null,
    score: 5,
    comment: 'Бриф собран, согласован, готов для AI-лидов.',
    approved: true,
    needsRework: false,
    reviewer: 'Команда ZAPUSK AI',
  };
  if (existingBriefReview) {
    await prisma.artefactReview.update({
      where: { id: existingBriefReview.id },
      data: { ...briefReviewData, archivedAt: null },
    });
  } else {
    await prisma.artefactReview.create({
      data: { projectId, ...briefReviewData },
    });
  }
}

// Sprint 25 — helper для bootstrap-аккаунтов.
// • upsert по email
// • если password пустой → не выставляем passwordHash (disabled аккаунт),
//   логин невозможен до момента, пока владелец не пропишет env-переменную
// • роль и workspaceStatus всегда восстанавливаются из bootstrap-конфига
//   (можно «починить» испорченный аккаунт следующим запуском seed)
async function upsertBootstrap(opts: {
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FOUNDER' | 'INVESTOR';
  workspaceStatus: 'active' | 'demo';
  password: string;
  envVarName: string;
}): Promise<void> {
  const email = opts.email.toLowerCase();
  // Sprint 35 P2 — явные логи, когда seed МЕНЯЕТ существующего пользователя
  // (role / workspaceStatus / name). Чтобы из деплой-логов было видно, что
  // bootstrap не просто прошёл, но и реально что-то поменял в БД.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const diffs: string[] = [];
    if (existing.role !== opts.role) diffs.push(`role: ${existing.role} → ${opts.role}`);
    if ((existing.workspaceStatus ?? 'active') !== opts.workspaceStatus) diffs.push(`workspaceStatus: ${existing.workspaceStatus ?? 'active'} → ${opts.workspaceStatus}`);
    if ((existing.name ?? '') !== opts.name) diffs.push(`name: "${existing.name ?? ''}" → "${opts.name}"`);
    if (diffs.length > 0) console.log(`[seed] bootstrap ${email} — applying: ${diffs.join('; ')}`);
  }

  if (!opts.password) {
    console.warn(`[seed] ${opts.envVarName} not set — bootstrap account ${email} created without password (login disabled).`);
    await prisma.user.upsert({
      where: { email },
      update: { role: opts.role, workspaceStatus: opts.workspaceStatus, name: opts.name },
      create: { email, name: opts.name, role: opts.role, workspaceStatus: opts.workspaceStatus },
    });
    return;
  }

  const passwordHash = await hashPassword(opts.password);
  await prisma.user.upsert({
    where: { email },
    update: { role: opts.role, workspaceStatus: opts.workspaceStatus, name: opts.name, passwordHash },
    create: { email, name: opts.name, role: opts.role, workspaceStatus: opts.workspaceStatus, passwordHash },
  });
  console.log(`[seed] bootstrap ${email} (${opts.role}) — password set from ${opts.envVarName}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
