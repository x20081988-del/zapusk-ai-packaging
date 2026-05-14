import { Link } from 'react-router-dom';
import { Plus, Sparkles, Compass, ShieldCheck, Presentation } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { ProjectJourney } from './ProjectJourney';
import { BOOTSTRAP_PROJECT_JOURNEY } from '../../lib/projectJourney';

// Sprint 26 — bootstrap onboarding для активного клиента без проектов.
// Показывает «вы зашли в систему, начните путь подготовки к инвестициям»,
// большой CTA «Создать проект» и реальные 5 этапов (briefing активен,
// остальные locked). Никаких fake AI-лидов, AEO-баннеров или готовых
// материалов — это пустое начало, не витрина.
export function BootstrapWelcome({ userName }: { userName?: string | null }) {
  const greeting = userName ? `${userName}, добро пожаловать в ZAPUSK AI` : 'Добро пожаловать в ZAPUSK AI';
  return (
    <div className="space-y-6">
      <Card padded accent="zapusk" className="overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(196,148,58,0.18),transparent_32%),radial-gradient(circle_at_82%_0%,rgba(35,214,176,0.12),transparent_28%)]" />
        <div className="relative grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-stretch">
          <div>
            <div className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-zapusk/30 bg-zapusk/10 text-zapusk-400 text-[11px] font-semibold uppercase tracking-[0.1em] mb-4">
              <Sparkles size={13} /> Ваш рабочий кабинет активирован
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-primary tracking-tight max-w-3xl">
              {greeting}
            </h1>
            <p className="text-lg text-primary/90 mt-3 max-w-2xl leading-relaxed">
              Начните подготовку проекта к привлечению инвестиций.
            </p>
            <p className="text-sm text-secondary mt-3 max-w-3xl leading-relaxed">
              Платформа проведёт вас через бриф, упаковку, юридическую часть и AI-лидогенерацию.
              На каждом этапе с вами рядом — персональный менеджер и AI-инструменты ZAPUSK.
            </p>
            <div className="flex flex-wrap gap-2 mt-6">
              <Link to="/projects/new">
                <Button size="lg" iconLeft={<Plus size={16} strokeWidth={2.5} />}>
                  Создать проект
                </Button>
              </Link>
              <Link to="/demo">
                <Button size="lg" variant="secondary" iconLeft={<Presentation size={16} />}>
                  Посмотреть демо-кабинет
                </Button>
              </Link>
            </div>
          </div>
          <aside className="rounded-lg border border-line bg-canvas/55 p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">Что появится в кабинете</div>
            <Hint icon={<Compass size={13} />} text="Бриф проекта с AI-помощью" />
            <Hint icon={<Sparkles size={13} />} text="Упаковка под инвесторов" />
            <Hint icon={<ShieldCheck size={13} />} text="Юридическое сопровождение сделки" />
            <Hint icon={<Sparkles size={13} />} text="AI-лиды и встречи с инвесторами" />
          </aside>
        </div>
      </Card>

      <Card padded>
        <CardHeader
          title="С чего начать"
          subtitle="Первый шаг — создать проект и заполнить бриф. Следующие этапы откроются автоматически."
        />
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NextStep
            num={1}
            title="Создайте проект"
            text="Дайте проекту имя — это займёт меньше минуты."
            cta={
              <Link to="/projects/new">
                <Button size="sm" iconLeft={<Plus size={13} />}>Создать проект</Button>
              </Link>
            }
          />
          <NextStep
            num={2}
            title="Заполните бриф"
            text="Кратко об экономике, команде и инвестиционном запросе. AI поможет."
          />
          <NextStep
            num={3}
            title="Запустите упаковку"
            text="Платформа соберёт презентацию, посадочную и финмодель."
          />
        </ol>
      </Card>

      <ProjectJourney stages={BOOTSTRAP_PROJECT_JOURNEY} compact />
    </div>
  );
}

function Hint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-secondary">
      <span className="text-zapusk-400">{icon}</span>
      {text}
    </div>
  );
}

function NextStep({
  num, title, text, cta,
}: { num: number; title: string; text: string; cta?: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-hairline bg-canvas/45 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-zapusk/15 border border-zapusk/30 text-zapusk-400 text-xs font-bold font-num flex items-center justify-center">
          {num}
        </span>
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
      </div>
      <p className="text-xs text-secondary leading-relaxed">{text}</p>
      {cta && <div className="mt-1">{cta}</div>}
    </li>
  );
}
