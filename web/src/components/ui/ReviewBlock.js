import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import clsx from 'clsx';
import { Star, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';
// Inline review widget — 5-star score, comment, two checkboxes.
// Lives inside artefact cards. Save is async; we show a tiny "сохранено" state on success.
export function ReviewBlock({ current, onSave, compact }) {
    const [score, setScore] = useState(current?.score ?? 0);
    const [comment, setComment] = useState(current?.comment ?? '');
    const [approved, setApproved] = useState(current?.approved ?? false);
    const [needsRework, setNeedsRework] = useState(current?.needsRework ?? false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    async function save() {
        if (!score)
            return;
        setSaving(true);
        try {
            await onSave({ score, comment: comment.trim(), approved, needsRework });
            setSaved(true);
            setTimeout(() => setSaved(false), 1800);
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("div", { className: clsx('rounded-md border border-hairline bg-canvas/50 p-3 space-y-2.5', compact && 'p-2.5'), children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("div", { className: "flex items-center gap-0.5", children: [[1, 2, 3, 4, 5].map((n) => (_jsx("button", { type: "button", onClick: () => setScore(n), className: clsx('w-6 h-6 flex items-center justify-center transition-colors', score >= n ? 'text-zapusk-400' : 'text-faint hover:text-zapusk-400'), children: _jsx(Star, { size: 14, fill: score >= n ? 'currentColor' : 'none', strokeWidth: 2 }) }, n))), _jsx("span", { className: "ml-2 text-[11px] text-muted font-num", children: score ? `${score}/5` : 'без оценки' })] }), saved && _jsx("span", { className: "text-[10px] text-success uppercase tracking-wide", children: "\u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E" })] }), !compact && (_jsxs("div", { children: [_jsx(Textarea, { rows: 2, value: comment, onChange: (e) => setComment(e.target.value), placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439: \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C, \u0443\u0441\u0438\u043B\u0438\u0442\u044C \u0438\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C", className: "text-xs" }), _jsx(VoiceInputButton, { className: "mt-2", onTranscript: (text) => setComment((current) => current.trim() ? `${current.trim()} ${text}` : text) })] })), _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("label", { className: "flex items-center gap-1.5 text-[11px] text-secondary cursor-pointer select-none", children: [_jsx("input", { type: "checkbox", checked: approved, onChange: (e) => { setApproved(e.target.checked); if (e.target.checked)
                                            setNeedsRework(false); }, className: "accent-success w-3.5 h-3.5" }), _jsx(CheckCircle2, { size: 11, className: "text-success" }), "\u0413\u043E\u0434\u0438\u0442\u0441\u044F"] }), _jsxs("label", { className: "flex items-center gap-1.5 text-[11px] text-secondary cursor-pointer select-none", children: [_jsx("input", { type: "checkbox", checked: needsRework, onChange: (e) => { setNeedsRework(e.target.checked); if (e.target.checked)
                                            setApproved(false); }, className: "accent-warning w-3.5 h-3.5" }), _jsx(AlertTriangle, { size: 11, className: "text-warning" }), "\u0414\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C"] })] }), _jsx(Button, { size: "sm", variant: "secondary", onClick: save, loading: saving, disabled: !score, children: current ? 'Обновить' : 'Оценить' })] })] }));
}
