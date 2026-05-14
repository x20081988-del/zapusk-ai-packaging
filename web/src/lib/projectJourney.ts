export type JourneyStatus = 'locked' | 'available' | 'in_progress' | 'done';
export type JourneyOwner = 'Клиент' | 'Менеджер' | 'Юрист' | 'Маркетолог' | 'AI';

export interface JourneyStage {
  id: string;
  title: string;
  description: string;
  status: JourneyStatus;
  cta: string;
  owner: JourneyOwner;
  nextAction: string;
}

// Тексты короткие и действенные. description — одна строка, что произойдёт
// на этапе. nextAction — что должен сделать пользователь прямо сейчас.
export const DEFAULT_PROJECT_JOURNEY: JourneyStage[] = [
  {
    id: 'brief',
    title: 'Бриф проекта',
    description: 'Собираем экономику, команду и инвестиционный запрос.',
    status: 'done',
    cta: 'Открыть бриф',
    owner: 'Клиент',
    nextAction: 'Загрузить материалы',
  },
  {
    id: 'marketing',
    title: 'Маркетинговая упаковка',
    description: 'Презентация, посадочная, one-pager и финмодель.',
    status: 'done',
    cta: 'Смотреть материалы',
    owner: 'Маркетолог',
    nextAction: 'Утвердить материалы',
  },
  {
    id: 'legal',
    title: 'Юридическая упаковка',
    description: 'Структура сделки и документы под инвестора.',
    status: 'in_progress',
    cta: 'Запросить юриста',
    owner: 'Юрист',
    nextAction: 'Подтвердить юрлицо и долю',
  },
  {
    id: 'ai-leads',
    title: 'AI-лиды',
    description: 'AI приводит квалифицированных инвесторов.',
    status: 'in_progress',
    cta: 'Открыть AI-лиды',
    owner: 'Менеджер',
    nextAction: 'Запустить поток лидов',
  },
  {
    id: 'meetings',
    title: 'Встречи с инвесторами',
    description: 'Подготовка и проведение созвонов.',
    status: 'available',
    cta: 'Подготовиться',
    owner: 'Менеджер',
    nextAction: 'Дождаться горячего лида',
  },
  {
    id: 'mechanics',
    title: 'Механика сделки',
    description: 'Доля, займ, конвертируемый займ или эскроу.',
    status: 'available',
    cta: 'Выбрать механику',
    owner: 'Юрист',
    nextAction: 'Получить подтверждение интереса',
  },
  {
    id: 'escrow',
    title: 'Операционная схема',
    description: 'Документы под выбранную механику.',
    status: 'locked',
    cta: 'Откроется позже',
    owner: 'Юрист',
    nextAction: 'Согласовать условия',
  },
  {
    id: 'platform-deals',
    title: 'Сделки через платформу',
    description: 'Документы и статусы каждого инвестора.',
    status: 'locked',
    cta: 'Откроется позже',
    owner: 'Менеджер',
    nextAction: 'Инвестор готов к подписи',
  },
  {
    id: 'round-close',
    title: 'Закрытие раунда',
    description: 'Фиксируем сумму и обязательства сторон.',
    status: 'locked',
    cta: 'Откроется позже',
    owner: 'Менеджер',
    nextAction: 'Подписать сделки',
  },
  {
    id: 'shareholders',
    title: 'Работа с акционерами',
    description: 'Отчётность и сопровождение после раунда.',
    status: 'locked',
    cta: 'Откроется позже',
    owner: 'Менеджер',
    nextAction: 'Раунд закрыт',
  },
];

// Sprint 26 — bootstrap state. Используется на Dashboard для активного
// клиента без проектов. 5 этапов реального пути привлечения инвестиций:
// brief → marketing → legal → ai-leads → meetings. Без fake «done» —
// всё, кроме первого шага, locked. CTA говорит, что нужно для разблокировки.
export const BOOTSTRAP_PROJECT_JOURNEY: JourneyStage[] = [
  {
    id: 'brief',
    title: 'Бриф проекта',
    description: 'Соберём экономику, команду и инвестиционный запрос вместе с менеджером.',
    status: 'in_progress',
    cta: 'Создать проект',
    owner: 'Клиент',
    nextAction: 'Заполнить первичные данные',
  },
  {
    id: 'marketing',
    title: 'Маркетинговая упаковка',
    description: 'Презентация, посадочная и one-pager под инвестора.',
    status: 'locked',
    cta: 'Откроется после брифа',
    owner: 'Маркетолог',
    nextAction: 'Ожидаем данные брифа',
  },
  {
    id: 'legal',
    title: 'Юридическая упаковка',
    description: 'Структура сделки и документы под выбранную механику.',
    status: 'locked',
    cta: 'Откроется после упаковки',
    owner: 'Юрист',
    nextAction: 'Ожидаем готовую упаковку',
  },
  {
    id: 'ai-leads',
    title: 'AI-лиды',
    description: 'AI приведёт квалифицированных инвесторов по вашему профилю.',
    status: 'locked',
    cta: 'Откроется после юр. упаковки',
    owner: 'AI',
    nextAction: 'Ожидаем готовые материалы',
  },
  {
    id: 'meetings',
    title: 'Встречи с инвесторами',
    description: 'Подготовка, проведение и фиксация результата каждой встречи.',
    status: 'locked',
    cta: 'Откроется после первого лида',
    owner: 'Менеджер',
    nextAction: 'Ожидаем горячий лид',
  },
];
