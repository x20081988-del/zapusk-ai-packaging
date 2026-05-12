import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
const TONES = {
    neutral: 'bg-hairline/60 text-secondary border-line',
    zapusk: 'bg-zapusk/12 text-zapusk-400 border-zapusk/30',
    ai: 'bg-ai/12 text-ai-glow border-ai/30',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    danger: 'bg-danger/10 text-danger border-danger/30',
    info: 'bg-info/10 text-info border-info/30',
};
export function StatusBadge({ children, tone = 'neutral', dot }) {
    return (_jsxs("span", { className: clsx('inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-[11px] font-semibold uppercase tracking-[0.06em]', TONES[tone]), children: [dot && (_jsx("span", { className: clsx('w-1.5 h-1.5 rounded-full', tone === 'zapusk' && 'bg-zapusk shadow-glow', tone === 'ai' && 'bg-ai shadow-ai-glow', tone === 'success' && 'bg-success', tone === 'warning' && 'bg-warning', tone === 'danger' && 'bg-danger', tone === 'info' && 'bg-info', tone === 'neutral' && 'bg-muted') })), children] }));
}
