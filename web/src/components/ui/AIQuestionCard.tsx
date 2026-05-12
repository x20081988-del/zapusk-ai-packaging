import { Sparkles } from 'lucide-react';
import { Card } from './Card';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';

interface Props {
  index: number;
  question: string;
  category?: string;
  value: string;
  onChange: (v: string) => void;
}

export function AIQuestionCard({ index, question, category, value, onChange }: Props) {
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
          </div>
          <p className="text-sm text-primary leading-snug">{question}</p>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Ваш ответ — кратко и конкретно"
      />
      <VoiceInputButton
        className="mt-2"
        label="Надиктовать ответ"
        onTranscript={(text) => onChange(value.trim() ? `${value.trim()} ${text}` : text)}
      />
    </Card>
  );
}
