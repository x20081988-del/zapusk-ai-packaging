import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import { PROMPT_KIND_LABELS, formatDate } from '../lib/format';
import { sanitizePublicText } from '../lib/publicText';
export default function ProjectPrompts() {
    const { id } = useParams();
    const [prompts, setPrompts] = useState([]);
    const [active, setActive] = useState(null);
    useEffect(() => {
        if (!id)
            return;
        api.get(`/api/prompts/${id}`).then((r) => {
            setPrompts(r.prompts);
            if (r.prompts[0])
                setActive(r.prompts[0].id);
        });
    }, [id]);
    const grouped = useMemo(() => {
        const m = new Map();
        for (const p of prompts) {
            if (!m.has(p.kind))
                m.set(p.kind, []);
            m.get(p.kind).push(p);
        }
        return m;
    }, [prompts]);
    const current = prompts.find((p) => p.id === active);
    const currentBody = sanitizePublicText(current?.body);
    return (_jsx(AppLayout, { title: "\u0417\u0430\u0434\u0430\u043D\u0438\u044F \u0434\u043B\u044F \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432", action: _jsx(Link, { to: `/projects/${id}`, children: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(ArrowLeft, { size: 14 }), children: "\u041A \u043F\u0440\u043E\u0435\u043A\u0442\u0443" }) }), children: prompts.length === 0 ? (_jsx(Card, { padded: true, children: _jsx(EmptyState, { title: "\u0417\u0430\u0434\u0430\u043D\u0438\u044F \u0435\u0449\u0451 \u043D\u0435 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u044B", description: "\u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u0432 \u0440\u0430\u0437\u0434\u0435\u043B \u00AB\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0430\u00BB \u0438 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u0443\u0439\u0442\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u043E\u043D\u043D\u043E\u0439 \u043F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u0438, \u043F\u043E\u0441\u0430\u0434\u043E\u0447\u043D\u043E\u0439 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B, \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u0434\u0440\u0443\u0433\u0438\u0445 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432 \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u043E\u0432.", action: _jsx(Link, { to: `/projects/${id}/packaging`, children: _jsx(Button, { children: "\u041A \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430\u043C \u043F\u0440\u043E\u0435\u043A\u0442\u0430" }) }) }) })) : (_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4", children: [_jsx(Card, { padded: false, children: _jsx("div", { className: "p-3 space-y-1 max-h-[70vh] overflow-y-auto", children: Array.from(grouped.entries()).map(([kind, items]) => {
                            const meta = PROMPT_KIND_LABELS[kind];
                            return (_jsxs("div", { className: "mb-2", children: [_jsx("div", { className: "px-2 pb-1.5 pt-2 text-[10px] uppercase tracking-[0.12em] text-faint font-semibold", children: meta?.title ?? kind }), items.map((p) => (_jsxs("button", { onClick: () => setActive(p.id), className: `w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md transition-colors ${active === p.id ? 'bg-zapusk/10 text-primary' : 'text-secondary hover:bg-surface hover:text-primary'}`, children: [_jsxs("span", { className: "text-xs", children: ["v", p.version] }), _jsx("span", { className: "text-[10px] text-muted", children: formatDate(p.createdAt) })] }, p.id)))] }, kind));
                        }) }) }), current ? (_jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: PROMPT_KIND_LABELS[current.kind]?.title ?? current.kind, subtitle: `Версия ${current.version} · ${formatDate(current.createdAt)}`, action: _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs(StatusBadge, { tone: PROMPT_KIND_LABELS[current.kind]?.accent ?? 'neutral', dot: true, children: ["v", current.version] }), _jsx(Button, { size: "sm", variant: "secondary", iconLeft: _jsx(Copy, { size: 12 }), onClick: () => navigator.clipboard.writeText(currentBody), children: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C" }), _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(Download, { size: 12 }), onClick: () => window.open(`/api/projects/${id}/prompts/${current.id}.md`), children: "\u0422\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439 \u0444\u0430\u0439\u043B \u0434\u043B\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B" })] }) }), _jsx("pre", { className: "bg-canvas border border-hairline rounded-md p-4 text-[12.5px] text-secondary leading-relaxed whitespace-pre-wrap font-num", children: currentBody })] })) : (_jsx(Card, { padded: true, children: _jsx("p", { className: "text-sm text-muted", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435" }) }))] })) }));
}
