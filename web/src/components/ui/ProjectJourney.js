import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CheckCircle2, Clock3, Lock, PlayCircle } from 'lucide-react';
import { Card, CardHeader } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
const STATUS_LABEL = {
    locked: 'Закрыт',
    available: 'Доступен',
    in_progress: 'В работе',
    done: 'Готово',
};
const STATUS_TONE = {
    locked: 'neutral',
    available: 'info',
    in_progress: 'ai',
    done: 'success',
};
export function ProjectJourney({ stages, compact }) {
    return (_jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u041F\u0443\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043F\u043E \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435", subtitle: "\u041E\u0442 \u0431\u0440\u0438\u0444\u0430 \u0438 \u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0438 \u0434\u043E \u0441\u0434\u0435\u043B\u043E\u043A, \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u044F \u0440\u0430\u0443\u043D\u0434\u0430 \u0438 \u0440\u0430\u0431\u043E\u0442\u044B \u0441 \u0430\u043A\u0446\u0438\u043E\u043D\u0435\u0440\u0430\u043C\u0438" }), _jsx("div", { className: compact ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3', children: stages.map((stage, index) => (_jsx("div", { className: "rounded-md border border-hairline bg-canvas/45 p-3", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: `w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${iconShell(stage.status)}`, children: iconFor(stage.status) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("span", { className: "text-[11px] text-muted font-num", children: ["#", index + 1] }), _jsx("h3", { className: "text-sm font-semibold text-primary", children: stage.title }), _jsx(StatusBadge, { tone: STATUS_TONE[stage.status], dot: true, children: STATUS_LABEL[stage.status] })] }), _jsx("p", { className: "text-xs text-secondary leading-relaxed mt-1", children: stage.description }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-2 mt-3 text-[11px]", children: [_jsx(Meta, { label: "\u041E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439", value: stage.owner }), _jsx(Meta, { label: "\u0414\u0430\u043B\u044C\u0448\u0435", value: stage.requirement, span: true })] })] }), _jsx(Button, { size: "sm", variant: stage.status === 'locked' ? 'ghost' : 'secondary', disabled: stage.status === 'locked', children: stage.cta })] }) }, stage.id))) })] }));
}
function Meta({ label, value, span }) {
    return (_jsxs("div", { className: `rounded-md border border-hairline bg-surface px-3 py-2 ${span ? 'lg:col-span-2' : ''}`, children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.1em] text-muted font-semibold", children: label }), _jsx("div", { className: "text-xs text-primary mt-0.5 leading-snug", children: value })] }));
}
function iconFor(status) {
    if (status === 'done')
        return _jsx(CheckCircle2, { size: 15 });
    if (status === 'in_progress')
        return _jsx(PlayCircle, { size: 15 });
    if (status === 'available')
        return _jsx(Clock3, { size: 15 });
    return _jsx(Lock, { size: 14 });
}
function iconShell(status) {
    if (status === 'done')
        return 'border-success/35 bg-success/10 text-success';
    if (status === 'in_progress')
        return 'border-ai/35 bg-ai/10 text-ai-glow';
    if (status === 'available')
        return 'border-info/35 bg-info/10 text-info';
    return 'border-line bg-elevated text-muted';
}
