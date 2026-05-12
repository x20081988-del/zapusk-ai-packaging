import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowRight, ExternalLink, FileText, Globe2, Image as ImageIcon, Table2 } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
export function TransformationShowcase({ item }) {
    return (_jsxs(Card, { padded: true, className: "mb-6 overflow-hidden", children: [_jsx("div", { className: "absolute -top-20 -left-20 w-72 h-72 bg-ai/10 rounded-full blur-3xl" }), _jsxs("div", { className: "relative", children: [_jsx(CardHeader, { title: "\u0422\u0440\u0430\u043D\u0441\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F \u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0438", subtitle: item.summary }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-[1fr_auto_1.4fr] gap-4 items-stretch", children: [_jsx(MaterialColumn, { title: item.beforeLabel, tone: "neutral", items: item.before }), _jsx("div", { className: "hidden lg:flex items-center justify-center px-1 text-zapusk-400", children: _jsx("div", { className: "w-10 h-10 rounded-full border border-zapusk/30 bg-zapusk/10 flex items-center justify-center shadow-glow", children: _jsx(ArrowRight, { size: 18 }) }) }), _jsx(MaterialColumn, { title: item.afterLabel, tone: "ai", items: item.after })] })] })] }));
}
function MaterialColumn({ title, tone, items }) {
    return (_jsxs("div", { className: "rounded-lg border border-hairline bg-canvas/45 p-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 mb-3", children: [_jsx("h3", { className: "text-sm font-semibold text-primary", children: title }), _jsx(StatusBadge, { tone: tone, dot: true, children: tone === 'ai' ? 'Стало' : 'Было' })] }), _jsx("div", { className: "space-y-2.5", children: items.map((m) => (_jsx(MiniMaterial, { material: m }, m.id))) })] }));
}
function MiniMaterial({ material }) {
    return (_jsxs("div", { className: "flex items-start gap-3 rounded-md border border-line bg-surface p-3", children: [_jsx("div", { className: "w-9 h-9 rounded-md bg-elevated border border-line flex items-center justify-center shrink-0", children: iconFor(material) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "text-sm font-medium text-primary leading-snug", children: material.title }), _jsx("div", { className: "text-xs text-muted mt-1 line-clamp-2", children: material.description }), _jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-1.5", children: [_jsxs(StatusBadge, { tone: material.phase === 'after' ? 'ai' : 'neutral', children: ["v", material.version] }), _jsx("span", { className: "text-[11px] text-muted", children: material.format })] })] }), _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(ExternalLink, { size: 12 }), onClick: () => window.open(material.url, '_blank', 'noreferrer'), children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C" })] }));
}
function iconFor(material) {
    if (material.kind === 'landing')
        return _jsx(Globe2, { size: 15, className: "text-ai-glow" });
    if (material.kind === 'financial' || material.kind === 'calculator')
        return _jsx(Table2, { size: 15, className: "text-success" });
    if (material.kind === 'teaser')
        return _jsx(ImageIcon, { size: 15, className: "text-zapusk-400" });
    return _jsx(FileText, { size: 15, className: "text-secondary" });
}
