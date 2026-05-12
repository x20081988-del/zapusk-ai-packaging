import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { FileCode2 } from 'lucide-react';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
const CATEGORY_TONE = {
    landing: 'ai',
    pitch: 'ai',
    financial: 'ai',
    sales: 'ai',
    faq: 'zapusk',
    summary: 'zapusk',
    spec: 'info',
};
export function TemplateCard({ template, onOpen }) {
    return (_jsxs(Card, { hoverable: true, onClick: onOpen, children: [_jsxs("div", { className: "flex items-start gap-3 mb-3", children: [_jsx("div", { className: "w-10 h-10 rounded-md bg-elevated border border-line flex items-center justify-center flex-shrink-0", children: _jsx(FileCode2, { size: 16, className: "text-secondary" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(StatusBadge, { tone: CATEGORY_TONE[template.category] ?? 'neutral', children: template.category }), !template.active && _jsx(StatusBadge, { tone: "neutral", children: "disabled" })] }), _jsx("h3", { className: "text-sm font-semibold text-primary truncate", children: template.name }), _jsx("p", { className: "text-xs text-muted mt-1 line-clamp-2", children: template.description ?? '—' })] })] }), _jsx("div", { className: "text-[10px] uppercase tracking-[0.1em] text-faint font-mono", children: template.key })] }));
}
