import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Wand2, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';
export function RegenerateModal({ open, onClose, title, defaultFeedback, onSubmit }) {
    const [text, setText] = useState(defaultFeedback ?? '');
    const [running, setRunning] = useState(false);
    async function submit() {
        setRunning(true);
        try {
            await onSubmit(text.trim());
            onClose();
            setText('');
        }
        finally {
            setRunning(false);
        }
    }
    return (_jsx(Modal, { open: open, onClose: onClose, title: `Доработать · ${title}`, width: "max-w-xl", children: _jsxs("div", { className: "p-5 space-y-4", children: [_jsxs("div", { className: "flex items-start gap-3 p-3 rounded-md bg-ai/5 border border-ai/20", children: [_jsx(Sparkles, { size: 14, className: "text-ai-glow mt-0.5 shrink-0" }), _jsx("p", { className: "text-xs text-secondary leading-relaxed", children: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F. \u0421\u0438\u0441\u0442\u0435\u043C\u0430 \u0441\u043E\u0437\u0434\u0430\u0441\u0442 \u043D\u043E\u0432\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0441 \u0443\u0447\u0451\u0442\u043E\u043C \u0432\u0430\u0448\u0435\u0433\u043E \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u044F." })] }), _jsxs("div", { children: [_jsx(Textarea, { label: "\u0427\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C?", value: text, onChange: (e) => setText(e.target.value), rows: 5, placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u043F\u0440\u043E \u043F\u0440\u043E\u0434\u0443\u043A\u0442, \u043C\u0430\u043B\u043E \u043F\u0440\u043E \u0434\u043E\u0445\u043E\u0434 \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430. \u0423\u0441\u0438\u043B\u0438\u0442\u044C \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0439 \u043E\u043A\u0443\u043F\u0430\u0435\u043C\u043E\u0441\u0442\u0438 \u0438 \u0440\u0438\u0441\u043A\u0438." }), _jsx(VoiceInputButton, { className: "mt-2", onTranscript: (transcript) => setText((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript) })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { variant: "ghost", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { variant: "ai", iconLeft: _jsx(Wand2, { size: 14 }), onClick: submit, loading: running, disabled: !text.trim(), children: "\u0414\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C" })] })] }) }));
}
