import { Link } from 'react-router-dom';
import {
  Brain, Sparkles, Mic, ShieldCheck, CheckCircle2, XCircle, Play, ChevronRight, FileText, MessageSquare,
} from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';

// Sprint 26 — отдельная демо-витрина AI-разбора переговоров. Показываем
// готовый разбор реального звонка Главснаб с инвестором, без необходимости
// загружать аудио. Учебный материал «как читать AI-анализ».
export default function DemoConversationAnalysis() {
  return (
    <AppLayout
      title="Демо AI-переговоры · Главснаб"
      action={
        <Link to="/conversation-analysis">
          <Button variant="primary" size="md" iconRight={<ChevronRight size={14} />}>
            Разобрать свой звонок
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">
        <Card padded accent="ai" className="overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(35,214,176,0.14),transparent_30%)]" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-grad-ai/15 border border-ai/30 text-ai-glow flex items-center justify-center shrink-0">
              <Brain size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-ai-glow font-semibold mb-1">
                Демо-разбор · Главснаб × частный инвестор
              </div>
              <h2 className="text-base font-semibold text-primary">
                Так выглядит AI-разбор реального звонка с инвестором
              </h2>
              <p className="text-xs text-secondary mt-1 leading-relaxed max-w-3xl">
                Это показательный кейс. Загрузите свой звонок в разделе AI-разбор переговоров —
                получите такой же отчёт со score, эмоциональным контекстом и рекомендациями
                для следующего шага.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-4">
            <Card padded>
              <CardHeader
                title="Звонок · 7 мин 24 сек"
                subtitle="Главснаб × Алексей К. · частный инвестор · 13 мая 2026"
                action={<StatusBadge tone="success" dot>Высокое качество</StatusBadge>}
              />
              <div className="rounded-md border border-ai/25 bg-ai/8 p-4 flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-grad-ai text-canvas flex items-center justify-center shadow-ai-glow shrink-0">
                  <Mic size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-primary">Запись AI-звонка</div>
                  <p className="text-[11px] text-secondary mt-0.5">Транскрипт + разбор готовы</p>
                </div>
                <Button size="sm" variant="ai" iconLeft={<Play size={12} />}>Прослушать</Button>
                <Button size="sm" variant="secondary" iconLeft={<FileText size={12} />}>Транскрипт</Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ScoreCard label="Общий score" value="87" tone="success" />
                <ScoreCard label="Понимание" value="92" tone="ai" />
                <ScoreCard label="Возражения" value="83" tone="zapusk" />
                <ScoreCard label="Решение" value="78" tone="ai" />
              </div>
            </Card>

            <Card padded>
              <CardHeader title="Что заметил AI" subtitle="Семь ключевых моментов разговора" />
              <ul className="space-y-2">
                <Finding type="positive" text="Инвестор сам задал вопрос про юридическую структуру — высокий уровень интереса." />
                <Finding type="positive" text="AI-агент использовал кейс похожего проекта, чтобы снять возражение по горизонту." />
                <Finding type="positive" text="Инвестор подтвердил готовность к чеку до 2 млн ₽." />
                <Finding type="warning" text="Возражение «слишком долго» снято не до конца — стоит подкрепить one-pager'ом." />
                <Finding type="warning" text="AI не уточнил, был ли у инвестора похожий опыт в нише — это полезно для скриптов." />
                <Finding type="positive" text="Инвестор сам предложил следующий шаг — назначить встречу с фаундером." />
                <Finding type="positive" text="Эмоциональный тон в финале — позитивный, есть готовность вести переписку." />
              </ul>
            </Card>

            <Card padded>
              <CardHeader title="Рекомендации к следующему звонку" subtitle="AI подсказывает, что добавить и где усилить" />
              <ol className="space-y-2 text-sm">
                <Recommendation num={1} text="Высылаем one-pager и финмодель сегодня. Пометить как HOT в CRM." />
                <Recommendation num={2} text="Через 2 дня — звонок-знакомство с фаундером. Готовим краткую памятку по инвестору." />
                <Recommendation num={3} text="Подготовить ответы на вопросы по юр.структуре (доля vs конвертируемый займ)." />
                <Recommendation num={4} text="Использовать кейс из похожей ниши — он сработал, добавить в стандартный скрипт." />
              </ol>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card padded accent="zapusk">
              <CardHeader title="Эмоциональный контекст" subtitle="AI читает интонацию и реакцию" />
              <div className="space-y-2 text-xs">
                <Emotion label="Старт разговора" tone="neutral" value="нейтрально" />
                <Emotion label="Обсуждение экономики" tone="ai" value="заинтересован" />
                <Emotion label="Возражение «долго»" tone="warning" value="осторожен" />
                <Emotion label="Кейс похожего проекта" tone="ai" value="оживился" />
                <Emotion label="Завершение" tone="success" value="вовлечён" />
              </div>
            </Card>

            <Card padded accent="ai">
              <CardHeader title="Готовы разобрать свой звонок?" subtitle="Загрузите аудио или вставьте текст транскрипта" />
              <Link to="/conversation-analysis" className="block">
                <Button className="w-full" variant="ai" iconLeft={<Sparkles size={14} />}>
                  Перейти в AI-разбор
                </Button>
              </Link>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted">
                <ShieldCheck size={11} className="text-zapusk-400" />
                Записи доступны только вам и менеджеру
              </div>
            </Card>

            <Card padded>
              <CardHeader title="Что ещё умеет AI-разбор" />
              <div className="space-y-2 text-xs text-secondary">
                <Feature icon={<MessageSquare size={13} />} text="Извлекает возражения и ответы из транскрипта" />
                <Feature icon={<Brain size={13} />} text="Считает score по 6 параметрам разговора" />
                <Feature icon={<FileText size={13} />} text="Сохраняет историю разборов в кабинете" />
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function ScoreCard({ label, value, tone }: { label: string; value: string; tone: 'ai' | 'zapusk' | 'success' }) {
  const toneClass =
    tone === 'success' ? 'border-success/30 bg-success/10 text-success' :
    tone === 'ai' ? 'border-ai/30 bg-ai/10 text-ai-glow' :
    'border-zapusk/30 bg-zapusk/10 text-zapusk-400';
  return (
    <div className={`rounded-md border ${toneClass} px-3 py-3`}>
      <div className="text-[10px] uppercase tracking-[0.1em] font-semibold">{label}</div>
      <div className="text-2xl font-bold font-num mt-1">{value}</div>
    </div>
  );
}

function Finding({ type, text }: { type: 'positive' | 'warning'; text: string }) {
  const Icon = type === 'positive' ? CheckCircle2 : XCircle;
  const tone = type === 'positive' ? 'text-success' : 'text-warning';
  return (
    <li className="flex items-start gap-2 text-sm text-secondary leading-snug">
      <Icon size={14} className={`${tone} mt-0.5 shrink-0`} />
      <span>{text}</span>
    </li>
  );
}

function Recommendation({ num, text }: { num: number; text: string }) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-hairline bg-canvas/45 px-3 py-2.5">
      <span className="w-6 h-6 rounded-full bg-zapusk/15 border border-zapusk/30 text-zapusk-400 text-[11px] font-bold font-num flex items-center justify-center shrink-0">{num}</span>
      <span className="text-sm text-primary leading-snug">{text}</span>
    </li>
  );
}

function Emotion({ label, tone, value }: { label: string; tone: 'neutral' | 'ai' | 'warning' | 'success'; value: string }) {
  const toneClass =
    tone === 'success' ? 'text-success' :
    tone === 'ai' ? 'text-ai-glow' :
    tone === 'warning' ? 'text-warning' :
    'text-muted';
  return (
    <div className="flex items-center justify-between rounded-md border border-hairline bg-canvas/45 px-3 py-1.5">
      <span className="text-secondary">{label}</span>
      <span className={`font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zapusk-400">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
