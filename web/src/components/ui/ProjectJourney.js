import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CheckCircle2, Clock3, Lock, Loader2, ArrowRight } from 'lucide-react';
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
// Operating-workflow look: каждый этап — карточка с чётким номером, статусом,
// 1-строчным описанием и одной кнопкой действия. Никаких длинных абзацев.
export function ProjectJourney({ stages, compact }) {
    return (_jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u041F\u0443\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043F\u043E \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0435", subtitle: "\u041D\u0430 \u043A\u0430\u043A\u043E\u043C \u044D\u0442\u0430\u043F\u0435 \u0441\u0435\u0439\u0447\u0430\u0441 \u043F\u0440\u043E\u0435\u043A\u0442 \u0438 \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u0434\u0430\u043B\u044C\u0448\u0435" }), _jsx("div", { className: compact ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3', children: stages.map((stage, index) => (_jsx(StageCard, { stage: stage, index: index + 1 }, stage.id))) })] }));
}
function StageCard({ stage, index }) {
    const isLocked = stage.status === 'locked';
    const isDone = stage.status === 'done';
    return (_jsxs("div", { className: `group rounded-lg border p-4 transition-all ${shellClass(stage.status)}`, children: [_jsxs("div", { className: "flex items-start gap-3 mb-3", children: [_jsx("div", { className: `w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${iconShell(stage.status)}`, children: iconFor(stage.status) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsxs("span", { className: "text-[10px] text-muted font-num font-semibold", children: ["\u042D\u0422\u0410\u041F ", index] }), _jsx(StatusBadge, { tone: STATUS_TONE[stage.status], dot: true, children: STATUS_LABEL[stage.status] })] }), _jsx("h3", { className: "text-sm font-semibold text-primary leading-snug", children: stage.title })] })] }), _jsx("p", { className: "text-xs text-secondary leading-relaxed mb-3 min-h-[2.5rem]", children: stage.description }), _jsxs("div", { className: "flex items-center gap-2 text-[11px] text-muted mb-3", children: [_jsx("span", { className: "rounded-full bg-canvas/60 border border-hairline px-2 py-0.5", children: stage.owner }), !isDone && !isLocked && (_jsxs("span", { className: "flex items-center gap-1 text-primary", children: [_jsx(ArrowRight, { size: 11, className: "text-zapusk-400" }), _jsx("span", { className: "font-medium", children: stage.nextAction })] }))] }), _jsx(Button, { size: "sm", variant: isDone ? 'ghost' : isLocked ? 'ghost' : 'secondary', disabled: isLocked, className: "w-full", children: stage.cta })] }));
}
function shellClass(status) {
    if (status === 'done')
        return 'border-success/25 bg-success/4 hover:border-success/45';
    if (status === 'in_progress')
        return 'border-ai/30 bg-ai/4 hover:border-ai/50';
    if (status === 'available')
        return 'border-info/25 bg-canvas/40 hover:border-info/45';
    return 'border-hairline bg-canvas/30 opacity-70';
}
function iconFor(status) {
    if (status === 'done')
        return _jsx(CheckCircle2, { size: 16 });
    if (status === 'in_progress')
        return _jsx(Loader2, { size: 16, className: "animate-spin" });
    if (status === 'available')
        return _jsx(Clock3, { size: 16 });
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
