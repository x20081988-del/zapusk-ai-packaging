import { useLocation } from 'react-router-dom';
import { BriefcaseBusiness, Repeat, TrendingUp, UserRound } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';

// Sprint 25 — INVESTOR placeholder. Реальный investor UX (свой набор виджетов
// по портфелю, secondary market, открытым раундам) — отдельный sprint. Пока
// четыре страницы рендерятся единым компонентом с заглушкой, чтобы маршруты
// /opportunities / /portfolio / /secondary / /profile не возвращали 404.

const SECTIONS: Record<string, { title: string; subtitle: string; icon: React.ReactNode; description: string }> = {
  '/opportunities': {
    title: 'Инвест-возможности',
    subtitle: 'Открытые раунды на платформе ZAPUSK AI',
    icon: <TrendingUp size={24} />,
    description: 'Здесь появятся проекты, открытые для инвестиций: размещения, доли ООО, конвертируемые займы и SAFE. Команда ZAPUSK AI готовит первый поток сделок — мы напишем, как только список будет открыт.',
  },
  '/portfolio': {
    title: 'Портфель',
    subtitle: 'Ваши инвестиции на платформе',
    icon: <BriefcaseBusiness size={24} />,
    description: 'Здесь будут видны ваши инвестиционные позиции: суммы, доли, ожидаемая доходность и сценарии выхода. Раздел активируется после первой сделки через платформу.',
  },
  '/secondary': {
    title: 'Вторичный рынок',
    subtitle: 'Перепродажа долей между инвесторами',
    icon: <Repeat size={24} />,
    description: 'Платформа постепенно открывает возможность переуступки долей. Если вы хотите выйти из позиции досрочно — менеджер подберёт покупателя через нашу сеть инвесторов.',
  },
  '/profile': {
    title: 'Профиль инвестора',
    subtitle: 'Ваши данные и предпочтения по инвестициям',
    icon: <UserRound size={24} />,
    description: 'Здесь появятся настройки профиля инвестора: предпочитаемые отрасли, средний чек, горизонт инвестиций, KYC-документы. Сейчас уточняем формат — менеджер свяжется с вами для верификации.',
  },
};

export default function InvestorPortfolio() {
  const location = useLocation();
  const section = SECTIONS[location.pathname] ?? SECTIONS['/opportunities'];

  return (
    <AppLayout title={`${section.title} · ZAPUSK AI`}>
      <Card padded>
        <CardHeader title={section.title} subtitle={section.subtitle} />
        <EmptyState
          icon={section.icon}
          title="Раздел в подготовке"
          description={section.description}
          action={
            <a href="mailto:hello@zapusk.tech?subject=Запрос%20по%20разделу%20инвестора">
              <span className="text-sm text-zapusk-400 font-semibold hover:text-zapusk-300">
                Связаться с менеджером
              </span>
            </a>
          }
        />
      </Card>
    </AppLayout>
  );
}
