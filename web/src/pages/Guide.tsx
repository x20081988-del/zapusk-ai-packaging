import { Link } from 'react-router-dom';
import { Rocket, FolderPlus, UploadCloud, Wand2, Package, FileCheck2, Sparkles, MessageSquare, ChevronRight, BookOpen } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

// Internal user guide for the Zapusk team. Static content — kept in code rather
// than CMS to keep MVP simple; will move to editable Templates table when needed.

const STEPS = [
  {
    n: 1,
    icon: <FolderPlus size={16} />,
    title: 'Создать проект',
    text: 'Рабочий стол → «Новый проект». Заполните базовые поля: название, отрасль, стадия, сумма привлечения, доля, мин. чек, тип инвестора. ИНН можно оставить пустым, если юрлицо еще не создано.',
    cta: { label: 'Создать проект', to: '/projects/new' },
  },
  {
    n: 2,
    icon: <UploadCloud size={16} />,
    title: 'Загрузить материалы',
    text: 'На странице проекта загрузите презентации, финансовые модели, описания, изображения или добавьте ссылки на рабочие материалы. Содержимое файлов автоматически попадает в контекст проекта.',
  },
  {
    n: 3,
    icon: <Wand2 size={16} />,
    title: 'Сформировать полный комплект материалов',
    text: 'За один клик система готовит бриф, «бизнес на салфетке» и 10 заданий для инвестиционных материалов с подстановкой данных проекта.',
  },
  {
    n: 4,
    icon: <Package size={16} />,
    title: 'Скачать комплект',
    text: 'Кнопка в шапке проекта скачивает все подготовленные текстовые файлы для команды: бриф, одностраничник, задания для презентации, посадочной страницы, финансовой модели, калькулятора и ответов на вопросы инвестора.',
  },
  {
    n: 5,
    icon: <Sparkles size={16} />,
    title: 'Передать материалы в работу',
    text: 'Используйте задания из комплекта для создания инвестиционной посадочной страницы, PDF-презентации, финансовой модели, инвестиционного калькулятора и материалов для встречи с инвестором.',
  },
  {
    n: 6,
    icon: <FileCheck2 size={16} />,
    title: 'Поставить оценки',
    text: 'На карточке каждого материала — рейтинг 1-5, комментарий, чекбоксы «годится» / «доработать». На странице проверки видно, какие материалы уже готовы, а какие требуют внимания.',
    cta: { label: 'Открыть проверку', to: '/dashboard' },
  },
  {
    n: 7,
    icon: <MessageSquare size={16} />,
    title: 'Доработка по замечаниям',
    text: 'На любой карточке материала откройте задание, напишите комментарий и отправьте на доработку. Система создаст новую версию задания с учётом замечаний.',
  },
];

const PRINCIPLES = [
  {
    title: 'Продаём ДЕНЬГИ инвестора, не продукт',
    text: 'Любые материалы идут через формулу: «сколько вложу — сколько заработаю — когда получу». Это базовый принцип методологии Zapusk.',
  },
  {
    title: 'Калькулятор > PnL',
    text: 'Главный элемент финансовой модели — инвестиционный калькулятор на лендинге. PnL — это база, калькулятор — это точка принятия решения.',
  },
  {
    title: 'Трекшн = главный актив',
    text: 'Не статичные цифры, а история роста: «выросли с N до M за период за счёт [канал]». Если динамики нет — это сигнал добавить уточнение в бриф.',
  },
  {
    title: 'Материалы под тип инвестора',
    text: 'Частный → доход за срок. Фонд → рост и exit. Стратег → синергии. Грант → социальный/научный эффект.',
  },
  {
    title: 'Система не заменяет вас',
    text: 'Система ускоряет, структурирует и масштабирует работу. Но качество материалов = ваше понимание бизнеса + проверка командой.',
  },
];

export default function Guide() {
  return (
    <AppLayout
      title="Гайд команды"
      action={
        <a href="https://zapusk.tech" target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm" iconLeft={<BookOpen size={14} />}>База знаний Zapusk</Button>
        </a>
      }
    >
      <div className="max-w-readable mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold mb-2">
            <Rocket size={12} /> Рабочий процесс
          </div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Как команда Zapusk упаковывает проект</h1>
          <p className="text-sm text-secondary mt-2 leading-relaxed">
            Этот гайд описывает путь от загрузки исходных материалов до передачи готовых заданий команде. 7 шагов и 5 принципов.
          </p>
        </div>

        <Card padded className="mb-6">
          <CardHeader title="7 шагов работы с сервисом" subtitle="От пустого проекта до пакета у инвестора за один-два дня" />
          <ol className="space-y-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-md border border-hairline bg-canvas/40 p-4">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="w-9 h-9 rounded-md bg-grad-zapusk text-canvas font-bold flex items-center justify-center shadow-glow text-sm">
                      {s.n}
                    </div>
                    <div className="text-muted">{s.icon}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-primary mb-1">{s.title}</h3>
                    <p className="text-[13px] text-secondary leading-relaxed">{s.text}</p>
                    {s.cta && (
                      <Link to={s.cta.to} className="inline-block mt-2.5">
                        <Button size="sm" variant="ghost" iconRight={<ChevronRight size={12} />}>
                          {s.cta.label}
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card padded accent="zapusk">
          <CardHeader title="5 принципов методологии Zapusk" subtitle="Эти принципы зашиты в шаблоны заданий" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PRINCIPLES.map((p, i) => (
              <div key={i} className="rounded-md border border-hairline bg-canvas/40 p-4">
                <h4 className="text-sm font-semibold text-primary mb-1.5">{p.title}</h4>
                <p className="text-[12.5px] text-secondary leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
