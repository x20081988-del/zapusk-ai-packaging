import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCrmwebMeta, type CrmwebMeta } from '../../lib/crmweb';

// Чипы-переходы раздела CRM - как _nav_html у crm_web: Проекты, Все карточки и
// пять воронок с числом активных сделок. Активный чип подсвечен.

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
    { to: '/crm', label: 'Проекты' },
    { to: '/crm/board', label: 'Все карточки' },
    ...(meta?.pipelines ?? []).map((p) => ({ to: `/crm/p/${p.slug}`, label: p.label, n: p.active })),
  ];

  return (
    <nav className="flex flex-wrap gap-2 mb-4">
      {items.map((it) => (
        <Link key={it.to} to={it.to}
          className={`rounded-full px-3 py-1.5 text-sm border transition-colors ${
            active === it.to
              ? 'border-zapusk/60 bg-zapusk/10 text-primary'
              : 'border-line text-secondary hover:text-primary'
          }`}>
          {it.label}{typeof it.n === 'number' && <b className="ml-1">{it.n}</b>}
        </Link>
      ))}
    </nav>
  );
}
