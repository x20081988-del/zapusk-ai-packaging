// Sprint 62.P12 — премиальный cover-визуал для инвест-витрины.
// Без бинарных ассетов: градиент из view-model + крупная полупрозрачная
// иконка-watermark + мягкий световой блик. Один источник правды для карточки
// витрины и hero на странице сделки.

import {
  Building2, Dna, Flower2, Gem, Globe2, Leaf, Rocket, Sparkles, Wind,
  type LucideIcon,
} from 'lucide-react';
import type { CoverIcon, OpportunityCover } from '../../lib/opportunities';

const ICON: Record<CoverIcon, LucideIcon> = {
  flower: Flower2,
  dna: Dna,
  planet: Globe2,
  wind: Wind,
  building: Building2,
  rocket: Rocket,
  leaf: Leaf,
  gem: Gem,
  sparkles: Sparkles,
};

export function OpportunityCoverArt({
  cover,
  className = '',
  iconSize = 132,
  children,
}: {
  cover: OpportunityCover;
  className?: string;
  iconSize?: number;
  children?: React.ReactNode;
}) {
  const Icon = ICON[cover.icon] ?? Sparkles;
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={
        cover.coverUrl
          ? { backgroundImage: `url(${cover.coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { backgroundImage: cover.gradient }
      }
    >
      {/* watermark icon */}
      <Icon
        size={iconSize}
        strokeWidth={1}
        className="absolute -right-5 -bottom-6 text-white/15 pointer-events-none select-none"
      />
      {/* light bloom + dot grid texture */}
      <div className="absolute inset-0 bg-dot-grid opacity-[0.18] mix-blend-overlay pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/10 pointer-events-none" />
      {children}
    </div>
  );
}
