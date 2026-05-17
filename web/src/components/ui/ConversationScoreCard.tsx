import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { type ConversationAnalysisCard, SCORE_LABELS, SENTIMENT_TONE, SENTIMENT_LABEL } from '../../lib/conversationAnalysis';

// Sprint 53 — внутренняя методология не светится в UI. Внутренние enum
// S/P/I/N остаются как контракт с AI, но пользователь видит человеческое
// «Этап · ...» без слова SPIN и без букв С/П/У/Р.
const STAGE_HUMAN: Record<'S' | 'P' | 'I' | 'N', string> = {
  S: 'Понимаем контекст',
  P: 'Выявляем задачу',
  I: 'Уточняем важность',
  N: 'Переходим к решению',
};

// Звёздная оценка встречи — главный wow-блок страницы. Большая цифра + 6
// breakdown-метрик с прогресс-барами + sentiment badge.
export function ConversationScoreCard({ card }: { card: ConversationAnalysisCard }) {
  const score = card.aiScore;
  const scoreColor = score >= 75 ? 'text-success' : score >= 50 ? 'text-zapusk-400' : 'text-warning';

  return (
    <Card padded accent={score >= 75 ? 'zapusk' : 'ai'}>
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 items-center">
        {/* Big score */}
        <div className="flex flex-col items-center justify-center">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-2">Оценка встречи AI</div>
          <div className={`text-6xl font-bold font-num tracking-tight ${scoreColor}`}>{score}</div>
          <div className="text-sm text-muted mt-1">из 100</div>
          <div className="flex items-center gap-2 mt-3">
            <StatusBadge tone={SENTIMENT_TONE[card.sentiment]} dot>{SENTIMENT_LABEL[card.sentiment]}</StatusBadge>
            <span className="text-[11px] text-muted">Этап · {STAGE_HUMAN[card.spinStage]}</span>
          </div>
          <div className="mt-2 text-[11px] text-muted font-num">
            Вероятность сделки · <span className="text-primary font-semibold">{card.probabilityScore}%</span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="space-y-2.5">
          {SCORE_LABELS.map(({ key, label }) => {
            const v = card.aiScoreBreakdown[key];
            const barColor = v >= 75 ? 'bg-success' : v >= 50 ? 'bg-grad-zapusk' : 'bg-warning';
            return (
              <div key={key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-secondary">{label}</span>
                  <span className={`font-num font-semibold ${v >= 75 ? 'text-success' : v >= 50 ? 'text-zapusk-400' : 'text-warning'}`}>{v}</span>
                </div>
                <div className="h-1.5 rounded-full bg-hairline overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${v}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
