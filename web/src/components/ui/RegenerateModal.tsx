import { useState } from 'react';
import { Wand2, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  defaultFeedback?: string;
  onSubmit: (feedback: string) => Promise<void>;
}

export function RegenerateModal({ open, onClose, title, defaultFeedback, onSubmit }: Props) {
  const [text, setText] = useState(defaultFeedback ?? '');
  const [running, setRunning] = useState(false);

  async function submit() {
    setRunning(true);
    try {
      await onSubmit(text.trim());
      onClose();
      setText('');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Доработать · ${title}`} width="max-w-xl">
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-md bg-ai/5 border border-ai/20">
          <Sparkles size={14} className="text-ai-glow mt-0.5 shrink-0" />
          <p className="text-xs text-secondary leading-relaxed">
            Опишите замечания. Система создаст новую версию задания с учётом вашего комментария.
          </p>
        </div>

        <div>
          <Textarea
            label="Что нужно изменить?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Например: слишком много про продукт, мало про доход инвестора. Усилить сценарий окупаемости и риски."
          />
          <VoiceInputButton
            className="mt-2"
            onTranscript={(transcript) => setText((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="ai" iconLeft={<Wand2 size={14} />} onClick={submit} loading={running} disabled={!text.trim()}>
            Доработать
          </Button>
        </div>
      </div>
    </Modal>
  );
}
