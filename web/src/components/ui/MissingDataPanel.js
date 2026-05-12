import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { DollarSign, BarChart3, Users, Handshake, Activity, AlertTriangle, MessageCircleQuestion } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { parseObj } from '../../lib/format';
const CATEGORIES = [
    { key: 'financial', label: 'Финансы', icon: _jsx(DollarSign, { size: 14 }), tone: 'text-zapusk-400' },
    { key: 'market', label: 'Рынок', icon: _jsx(BarChart3, { size: 14 }), tone: 'text-info' },
    { key: 'team', label: 'Команда', icon: _jsx(Users, { size: 14 }), tone: 'text-ai-glow' },
    { key: 'deal', label: 'Условия сделки', icon: _jsx(Handshake, { size: 14 }), tone: 'text-zapusk-400' },
    { key: 'unit_econ', label: 'Юнит-экономика', icon: _jsx(Activity, { size: 14 }), tone: 'text-success' },
    { key: 'risks', label: 'Риски', icon: _jsx(AlertTriangle, { size: 14 }), tone: 'text-warning' },
];
export function MissingDataPanel({ rawJson, title = 'Что нужно уточнить для сильной упаковки', subtitle = 'Система нашла вопросы, без которых инвестиционные материалы могут быть неполными. Ответьте на них в интервью по проекту — после этого бриф и материалы можно будет доработать точнее.', interviewHref, }) {
    const data = parseObj(rawJson, {});
    const totalCount = CATEGORIES.reduce((acc, c) => acc + (data[c.key]?.length ?? 0), 0);
    return (_jsxs(Card, { padded: true, accent: "ai", children: [_jsx(CardHeader, { title: _jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx(MessageCircleQuestion, { size: 16, className: "text-ai-glow" }), title] }), subtitle: subtitle, action: interviewHref && (_jsx(Link, { to: interviewHref, children: _jsx(Button, { size: "sm", variant: "ai", children: "\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441\u044B" }) })) }), _jsxs("div", { className: "mb-4 rounded-md border border-ai/20 bg-ai/8 px-3 py-2 text-xs text-secondary leading-relaxed", children: ["\u042D\u0442\u043E \u043D\u0435 \u043E\u0448\u0438\u0431\u043A\u0430 \u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u0435, \u0430 \u0441\u043F\u0438\u0441\u043E\u043A \u0442\u043E\u0447\u0435\u043A, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043F\u043E\u043C\u043E\u0433\u0443\u0442 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u044E, \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u0443\u044E \u043C\u043E\u0434\u0435\u043B\u044C \u0438 \u043E\u0444\u0444\u0435\u0440 \u0443\u0431\u0435\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u0435\u0435.", totalCount > 0 && _jsxs("span", { className: "font-medium text-primary", children: [" \u0421\u0435\u0439\u0447\u0430\u0441 \u043E\u0442\u043A\u0440\u044B\u0442\u043E \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432: ", totalCount, "."] })] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: CATEGORIES.map(({ key, label, icon, tone }) => {
                    const items = data[key] ?? [];
                    return (_jsxs("div", { className: "bg-canvas/50 border border-hairline rounded-md p-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsxs("div", { className: `flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${tone}`, children: [icon, label] }), _jsx("span", { className: "text-[10px] text-muted font-num", children: items.length })] }), items.length === 0 ? (_jsx("p", { className: "text-[11px] text-faint", children: "\u2014 \u043F\u043E\u043A\u0440\u044B\u0442\u043E" })) : (_jsx("ul", { className: "space-y-1.5", children: items.map((q, i) => (_jsxs("li", { className: "flex items-start justify-between gap-3 text-[12px] text-secondary leading-snug pl-2 border-l border-line", children: [_jsx("span", { children: q }), interviewHref && (_jsx(Link, { to: interviewHref, className: "shrink-0 text-[11px] font-medium text-ai-glow hover:text-primary transition-colors", children: "\u041E\u0442\u0432\u0435\u0442\u0438\u0442\u044C" }))] }, i))) }))] }, key));
                }) })] }));
}
