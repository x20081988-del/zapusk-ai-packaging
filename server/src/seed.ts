import { prisma } from './db.js';
import { SEED_TEMPLATES } from './services/templateSeeds.js';
import { DEMO_PROJECTS, type DemoProject } from './services/demoSeeds.js';
import { env } from './env.js';
import { generateAllPrompts } from './services/promptBuilders.js';
import { resolveOrchestration } from './services/aiProviders.js';

async function main() {
  console.log('[seed] upserting prompt templates...');
  for (const t of SEED_TEMPLATES) {
    // Sprint 15: проставляем orchestration metadata из единого registry. Для
    // существующих строк это backfill (update пути обновляет поля), для
    // новых — заранее правильная провенанс.
    const orch = resolveOrchestration(t.key);
    await prisma.promptTemplate.upsert({
      where: { key: t.key },
      update: {
        name: t.name,
        category: t.category,
        description: t.description,
        body: t.body,
        ...(orch ? {
          provider: orch.provider,
          tool: orch.tool,
          model: orch.model,
          outputType: orch.outputType,
        } : {}),
      },
      create: {
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
  }

  console.log('[seed] upserting dev user...');
  const user = await prisma.user.upsert({
    where: { email: env.DEV_USER_EMAIL.toLowerCase() },
    update: {},
    create: { email: env.DEV_USER_EMAIL.toLowerCase(), name: env.DEV_USER_NAME },
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

  console.log('[seed] seeding demo project "Венский ветер"...');
  const demoExisting = await prisma.project.findFirst({ where: { name: 'Венский ветер', userId: user.id } });
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

  console.log('[seed] done.');
}

async function seedDemoArchetype(userId: string, d: DemoProject) {
  console.log(`[seed] seeding archetype "${d.name}"...`);
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
  };
  const existing = await prisma.project.findFirst({ where: { name: d.name, userId } });
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
