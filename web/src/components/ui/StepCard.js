import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { Check } from 'lucide-react';
export function StepCard({ index, label, done, current }) {
    return (_jsxs("div", { className: clsx('flex items-center gap-3 px-4 py-3 rounded-md border transition-all', done
            ? 'border-zapusk/30 bg-zapusk/5'
            : current
                ? 'border-ai/40 bg-ai/5'
                : 'border-line bg-surface'), children: [_jsx("div", { className: clsx('flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0', done
                    ? 'bg-grad-zapusk text-canvas shadow-glow'
                    : current
                        ? 'bg-grad-ai text-canvas shadow-ai-glow'
                        : 'bg-hairline text-muted border border-line'), children: done ? _jsx(Check, { size: 13, strokeWidth: 3 }) : index }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: clsx('text-[13px] font-medium leading-tight', done ? 'text-primary' : current ? 'text-primary' : 'text-secondary'), children: label }), _jsx("div", { className: "text-[10px] uppercase tracking-[0.1em] mt-0.5", children: _jsx("span", { className: done ? 'text-zapusk-400' : current ? 'text-ai-glow' : 'text-muted', children: done ? 'Готово' : current ? 'В работе' : 'Ожидание' }) })] })] }));
}
