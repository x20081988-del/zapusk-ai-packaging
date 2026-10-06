import { useEffect, useState } from 'react';
import { fetchCrmwebMeta, type CrmwebMeta } from '../../lib/crmweb';
import { ChoiceChip } from '../ui/Chip';

// Чипы-переходы раздела CRM - как _nav_html у crm_web: Проекты, Все карточки и
// пять воронок с числом активных сделок. Активный чип подсвечен.
//
// Design pass 06.10.2026: ряд не переносится, а прокручивается вбок. На телефоне
// восемь чипов в три строки съедали треть экрана до первой карточки.

// Последний справочник живет в модуле: навигация рисуется мгновенно при переходе
// между экранами, свежие числа доезжают следом. Счетчики тут ориентир, не отчет.
let lastMeta: CrmwebMeta | null = null;

export function CrmNav({ active }: { active: string }) {
  const [meta, setMeta] = useState<CrmwebMeta | null>(lastMeta);

  useEffect(() => {
    let alive = true;
    fetchCrmwebMeta()
      .then((m) => {
        lastMeta = m;
        if (alive) setMeta(m);
      })
      .catch(() => {
        // навигация не смеет ломаться из-за счетчиков - чипы живут без чисел
      });
    return () => { alive = false; };
  }, []);

  const items: Array<{ to: string; label: string; n?: number }> = [
    // Отделы первыми (владелец 28.09.2026): это его основной срез CRM.
    { to: '/crm/depts', label: 'Отделы' },
    { to: '/crm', label: 'Проекты' },
    { to: '/crm/board', label: 'Все карточки' },
    ...(meta?.pipelines ?? []).map((p) => ({ to: `/crm/p/${p.slug}`, label: p.label, n: p.active })),
  ];

  return (
    <nav
      aria-label="Разделы CRM"
      className="flex gap-2 mb-4 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap"
    >
      {items.map((it) => (
        <ChoiceChip
          key={it.to}
          to={it.to}
          count={it.n}
          active={active === it.to || (it.to !== '/crm' && active.startsWith(it.to + '/'))}
        >
          {it.label}
        </ChoiceChip>
      ))}
    </nav>
  );
}
