import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
export function ProgressBar({ value, size = 'md', accent = 'zapusk', showLabel }) {
    const clamped = Math.max(0, Math.min(100, value));
    return (_jsxs("div", { className: clsx('w-full', showLabel && 'space-y-1.5'), children: [showLabel && (_jsxs("div", { className: "flex justify-between text-[11px] font-medium text-muted", children: [_jsx("span", { children: "\u0413\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432" }), _jsxs("span", { className: "text-primary font-num", children: [clamped, "%"] })] })), _jsx("div", { className: clsx('w-full bg-hairline rounded-full overflow-hidden', size === 'sm' ? 'h-1' : 'h-1.5'), children: _jsx("div", { className: clsx('h-full transition-all duration-500 ease-smooth rounded-full', accent === 'zapusk' ? 'bg-grad-zapusk' : 'bg-grad-ai'), style: { width: `${clamped}%` } }) })] }));
}
