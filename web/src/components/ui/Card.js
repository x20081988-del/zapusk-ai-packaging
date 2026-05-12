import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
export function Card({ padded = true, hoverable, accent = null, className, children, ...rest }) {
    return (_jsxs("div", { className: clsx('relative bg-surface border border-line rounded-lg shadow-card overflow-hidden', padded && 'p-5', hoverable && 'transition-all duration-150 hover:border-zapusk/40 hover:shadow-lifted hover:-translate-y-0.5 cursor-pointer', className), ...rest, children: [accent && (_jsx("div", { className: clsx('absolute inset-x-0 top-0 h-px', accent === 'zapusk' ? 'bg-grad-zapusk' : 'bg-grad-ai') })), children] }));
}
export function CardHeader({ title, subtitle, action }) {
    return (_jsxs("div", { className: "flex items-start justify-between gap-4 mb-4", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-[15px] font-semibold text-primary tracking-tight", children: title }), subtitle && _jsx("p", { className: "text-xs text-muted mt-0.5", children: subtitle })] }), action] }));
}
