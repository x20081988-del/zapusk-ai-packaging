import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Input';
import { PersonalManagerCard } from '../components/ui/PersonalManagerCard';
import { VoiceInputButton } from '../components/ui/VoiceInputButton';

export default function PersonalManager() {
  const [requestText, setRequestText] = useState('');
  const [success, setSuccess] = useState(false);

  function submitHelpRequest() {
    setSuccess(true);
    setRequestText('');
    window.setTimeout(() => setSuccess(false), 3500);
  }

  return (
    <AppLayout title="Персональный менеджер">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <PersonalManagerCard />
          <Card padded>
            <CardHeader title="Запросить помощь" subtitle="Опишите вопрос текстом или голосом — менеджер увидит запрос и свяжется с вами." />
            <Textarea
              rows={5}
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="Например: помогите понять, какие данные нужны для юридической упаковки или как подготовиться к звонку с инвестором."
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <Button iconLeft={<Send size={14} />} onClick={submitHelpRequest} disabled={!requestText.trim()}>
                Запросить помощь
              </Button>
              <VoiceInputButton
                label="Надиктовать запрос"
                size="sm"
                onTranscript={(text) => setRequestText((current) => current.trim() ? `${current.trim()} ${text}` : text)}
              />
            </div>
            {success && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                <CheckCircle2 size={13} />
                Запрос зафиксирован, менеджер свяжется с вами.
              </div>
            )}
          </Card>
        </div>
        <aside className="space-y-4">
          <Card padded accent="ai">
            <CardHeader title="Чем поможет менеджер" subtitle="Сопровождение проекта по платформе" />
            <ul className="space-y-2 text-sm text-secondary">
              {[
                'поможет завершить бриф без лишних форм',
                'передаст замечания маркетологу и юристу',
                'подготовит проект к запуску AI-лидов',
                'разберёт записи разговоров и следующие шаги',
                'подскажет механику сделки с инвестором',
              ].map((item) => (
                <li key={item} className="rounded-md border border-hairline bg-canvas/45 px-3 py-2">{item}</li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </AppLayout>
  );
}
