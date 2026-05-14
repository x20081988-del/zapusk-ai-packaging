import { Link } from 'react-router-dom';
import { AlertCircle, Lock } from 'lucide-react';
import { getAuth, isWorkspaceActive, type WorkspaceStatus } from '../../lib/auth';

// Sprint 22 — баннер сверху страницы для не-active workspace'ов.
// Показывает, в каком состоянии воронки находится пользователь и что
// конкретно ограничено.

interface BannerCopy {
  tone: 'warning' | 'info' | 'danger';
  title: string;
  hint: string;
  ctaLabel?: string;
  ctaHref?: string;
}

const COPY: Record<WorkspaceStatus, BannerCopy | null> = {
  active: null, // никакого баннера
  demo: {
    tone: 'info',
    title: 'Демо-режим',
    hint: 'Вы видите интерфейс ZAPUSK AI в демо-режиме. Изменения и реальная упаковка проекта недоступны до активации аккаунта.',
    ctaLabel: 'Связаться с менеджером',
    ctaHref: 'mailto:hello@zapusk.tech?subject=Активация%20аккаунта%20ZAPUSK%20AI',
  },
  approved: {
    tone: 'info',
    title: 'Аккаунт одобрен',
    hint: 'Менеджер одобрил доступ. Активация произойдёт после оплаты — изменения временно недоступны.',
    ctaLabel: 'Активировать',
    ctaHref: 'mailto:hello@zapusk.tech?subject=Активация%20аккаунта%20ZAPUSK%20AI',
  },
  awaiting_payment: {
    tone: 'warning',
    title: 'Ожидаем оплату',
    hint: 'Аккаунт открыт в режиме чтения до подтверждения оплаты. Любые изменения временно недоступны.',
    ctaLabel: 'Связаться с менеджером',
    ctaHref: 'mailto:hello@zapusk.tech?subject=Активация%20аккаунта%20ZAPUSK%20AI',
  },
  lead: {
    tone: 'danger',
    title: 'Доступ ещё не открыт',
    hint: 'Ваш аккаунт в воронке знакомства с продуктом. Доступ к проектам откроется после demo и согласования с менеджером.',
    ctaLabel: 'Запросить demo',
    ctaHref: 'mailto:hello@zapusk.tech?subject=Запрос%20demo%20ZAPUSK%20AI',
  },
  paused: {
    tone: 'danger',
    title: 'Аккаунт приостановлен',
    hint: 'Доступ временно ограничен. Свяжитесь с менеджером ZAPUSK AI для разблокировки.',
    ctaLabel: 'Связаться',
    ctaHref: 'mailto:hello@zapusk.tech',
  },
  archived: {
    tone: 'danger',
    title: 'Аккаунт архивирован',
    hint: 'Этот аккаунт больше не активен. Для возобновления работы свяжитесь с командой.',
    ctaLabel: 'Связаться',
    ctaHref: 'mailto:hello@zapusk.tech',
  },
};

export function WorkspaceBanner() {
  const auth = getAuth();
  const status = auth?.workspaceStatus ?? null;
  if (!status || isWorkspaceActive(status)) return null;
  const copy = COPY[status];
  if (!copy) return null;

  const toneClass = copy.tone === 'danger'
    ? 'border-danger/30 bg-danger/8 text-danger'
    : copy.tone === 'warning'
      ? 'border-warning/30 bg-warning/8 text-warning'
      : 'border-info/30 bg-info/8 text-info';

  const Icon = copy.tone === 'danger' ? Lock : AlertCircle;

  return (
    <div className={`border ${toneClass} px-4 sm:px-6 lg:px-8 py-2.5 flex items-start gap-3`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold">{copy.title}</div>
        <div className="text-[11px] leading-snug opacity-90">{copy.hint}</div>
      </div>
      {copy.ctaLabel && copy.ctaHref && (
        copy.ctaHref.startsWith('mailto:') ? (
          <a href={copy.ctaHref} className="text-[11px] font-semibold underline shrink-0">{copy.ctaLabel}</a>
        ) : (
          <Link to={copy.ctaHref} className="text-[11px] font-semibold underline shrink-0">{copy.ctaLabel}</Link>
        )
      )}
    </div>
  );
}
