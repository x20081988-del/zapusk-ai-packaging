import { Sparkles, HelpCircle } from 'lucide-react';
import { Card } from './Card';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';
import { Button } from './Button';

interface Props {
  index: number;
  question: string;
  category?: string;
  value: string;
  onChange: (v: string) => void;
}

// Sprint 61.HOTFIX (P0.3) — explicit affordance: when founder doesn't have
// the data, they can mark the question as «no data, needs follow-up» with
// one click instead of having to type "нет информации" by hand. Brief
// regeneration accepts this exactly like any non-empty answer (see
// answeredQuestionSet in briefService.ts — ANY non-empty answer counts as
// answered), so this just makes the intent explicit + reduces friction.
const NO_DATA_MARKER = 'Нет данных — требует уточнения';

function isNoDataAnswer(value: string): boolean {
  const lower = value.trim().toLowerCase();
  // Match common Russian variants the founder might already have typed.
  return /^(нет\s+(данных|информации)|пока\s+нет\s+данных|не\s+знаем|уточняется|требует\s+уточнения)/.test(lower)
    || lower === NO_DATA_MARKER.toLowerCase();
}

export function AIQuestionCard({ index, question, category, value, onChange }: Props) {
  const isNoData = isNoDataAnswer(value);
  return (
    <Card accent="ai" className="bg-gradient-to-br from-surface to-surface/40">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-md bg-ai/15 border border-ai/30 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-ai-glow" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ai-glow">
              Вопрос {index}
            </span>
            {category && (
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted">· {category}</span>
            )}
            {isNoData && (
              <span className="text-[10px] uppercase tracking-[0.08em] text-warning font-semibold">
                · отмечено как «нет данных»
              </span>
            )}
          </div>
          <p className="text-sm text-primary leading-snug">{question}</p>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Ваш ответ — кратко и конкретно. Если данных пока нет — нажмите «Нет данных»."
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <VoiceInputButton
          label="Надиктовать ответ"
          size="sm"
          onTranscript={(text) => onChange(value.trim() ? `${value.trim()} ${text}` : text)}
        />
        <Button
          type="button"
          size="sm"
          variant={isNoData ? 'secondary' : 'ghost'}
          iconLeft={<HelpCircle size={12} />}
          onClick={() => onChange(isNoData ? '' : NO_DATA_MARKER)}
          title={isNoData
            ? 'Снять отметку «Нет данных» — сможете ответить позже'
            : 'Отметить вопрос как «нет данных» — бриф можно сохранить, AI пометит как «требует уточнения»'}
        >
          {isNoData ? 'Отменить «Нет данных»' : 'Нет данных'}
        </Button>
      </div>
    </Card>
  );
}
