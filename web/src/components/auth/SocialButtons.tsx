import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

// Sprint 19: «mock» social-login buttons. Реальные OAuth интеграции — отдельный
// sprint. Пока кнопки видны, но при клике показывают tooltip «Скоро добавим».
// Это сознательно: на лендинге/signup странице наличие этих кнопок повышает
// доверие (продукт «выглядит как настоящий»), а отсутствие реального OAuth
// — допустимый MVP-trade-off.

type Provider = 'google' | 'telegram' | 'yandex';

const LABEL: Record<Provider, string> = {
  google: 'Google',
  telegram: 'Telegram',
  yandex: 'Яндекс ID',
};

const TOOLTIP: Record<Provider, string> = {
  google: 'Скоро добавим вход через Google',
  telegram: 'Скоро добавим вход через Telegram',
  yandex: 'Скоро добавим вход через Яндекс ID',
};

export function SocialButtons() {
  const [active, setActive] = useState<Provider | null>(null);

  function bump(provider: Provider) {
    setActive(provider);
    setTimeout(() => setActive((cur) => (cur === provider ? null : cur)), 2_400);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(['google', 'telegram', 'yandex'] as Provider[]).map((p) => (
          <Button
            key={p}
            type="button"
            variant="secondary"
            size="md"
            className="w-full"
            iconLeft={<ProviderIcon provider={p} />}
            onClick={() => bump(p)}
          >
            {LABEL[p]}
          </Button>
        ))}
      </div>
      {active && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-info/10 border border-info/30 text-xs text-info">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {TOOLTIP[active]}
        </div>
      )}
    </div>
  );
}

function ProviderIcon({ provider }: { provider: Provider }) {
  // Простые «глифы» — используем монохромные SVG-замены чтобы не подключать
  // лишние иконочные паки. На production-варианте здесь будут реальные
  // brand-icons (Google G, Telegram paper plane, Яндекс).
  if (provider === 'google') return <Glyph letter="G" tone="warning" />;
  if (provider === 'telegram') return <Glyph letter="T" tone="info" />;
  return <Glyph letter="Я" tone="danger" />;
}

function Glyph({ letter, tone }: { letter: string; tone: 'warning' | 'info' | 'danger' }) {
  const cls = tone === 'warning' ? 'text-warning'
    : tone === 'info' ? 'text-info'
    : 'text-danger';
  return (
    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-sm font-bold text-[11px] ${cls}`}>
      {letter}
    </span>
  );
}
