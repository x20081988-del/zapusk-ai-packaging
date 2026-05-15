import { prisma } from './db.js';
import { SEED_TEMPLATES } from './services/templateSeeds.js';
import { DEMO_PROJECTS, type DemoProject } from './services/demoSeeds.js';
import { env } from './env.js';
import { generateAllPrompts } from './services/promptBuilders.js';
import { resolveOrchestration } from './services/aiProviders.js';
import { hashPassword } from './authCrypto.js';
import { IS_PRODUCTION, seedLog as log } from './seedGuards.js';

// Sprint 29 — production seed чисто-upsert. Никаких deleteMany на user/project/
// invite/файлах/брифах/promptах/job'ах/sessions/reviews. Demo-проекты
// обновляются только по isDemo=true. Reset-режим (полный wipe) живёт в
// scripts/devReset.ts и отказывает в production через assertNotProduction().

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
  log('seeding prompt templates (create-if-missing)...');
  for (const t of SEED_TEMPLATES) {
    const existing = await prisma.promptTemplate.findUnique({ where: { key: t.key } });
    if (existing) {
      console.log(`[seed] template exists, skip update: ${t.key}`);
      continue;
    }
    const orch = resolveOrchestration(t.key);
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
      await generateAllPrompts(demo.id);
    } catch (err) {
      console.warn('[seed] demo prompt generation skipped:', err instanceof Error ? err.message : err);
    }
  }

  // Sprint 3 — additional archetype demos
  for (const d of DEMO_PROJECTS) {
    await seedDemoArchetype(user.id, d);
  }

  log('done.');
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
    await generateAllPrompts(project.id);
  } catch (err) {
    console.warn(`[seed] prompts for ${d.name} skipped:`, err instanceof Error ? err.message : err);
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
