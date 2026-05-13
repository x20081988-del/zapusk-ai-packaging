import { MessageCircle, Send } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Input';
import { PersonalManagerCard } from '../components/ui/PersonalManagerCard';

export default function PersonalManager() {
  return (
    <AppLayout title="Персональный менеджер">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <PersonalManagerCard />
          <Card padded>
            <CardHeader title="Запросить помощь" subtitle="MVP-форма: обращение пока не отправляется в чат, но показывает будущий сценарий поддержки" />
            <Textarea
              rows={5}
              placeholder="Например: помогите понять, какие данные нужны для юридической упаковки или как подготовиться к звонку с инвестором."
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <Button iconLeft={<Send size={14} />}>Задать вопрос менеджеру</Button>
              <Button variant="secondary" iconLeft={<MessageCircle size={14} />}>Запросить помощь по этапу</Button>
            </div>
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
                'разберёт записи разговоров и next steps',
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
