import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { CheckCircle2, Copy, Download, ExternalLink, FileText, Globe2, Image as ImageIcon, MessageSquarePlus, RefreshCw, Table2, } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { Modal } from './Modal';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';
import { formatDate } from '../../lib/format';
import { sanitizePublicText } from '../../lib/publicText';
const STATUS_LABELS = {
    source: 'Исходный',
    platform: 'Создан платформой',
    rework: 'На доработке',
    approved: 'Утверждено',
};
const STATUS_TONES = {
    source: 'neutral',
    platform: 'ai',
    rework: 'warning',
    approved: 'success',
};
export function ProjectMaterialCard({ material, promptBody, promptVersion, review, regenerating, onGeneratePrompt, onRegenerateWithFeedback, onSaveReview, }) {
    const [promptOpen, setPromptOpen] = useState(false);
    const [comment, setComment] = useState(review?.comment ?? '');
    const [modalAction, setModalAction] = useState(null);
    const publicPrompt = sanitizePublicText(promptBody);
    const canRework = Boolean(material.promptKind && onRegenerateWithFeedback);
    const status = review?.approved ? 'approved' : review?.needsRework ? 'rework' : material.status;
    const icon = useMemo(() => {
        if (material.kind === 'landing')
            return _jsx(Globe2, { size: 16, className: "text-ai-glow" });
        if (material.kind === 'financial' || material.kind === 'calculator')
            return _jsx(Table2, { size: 16, className: "text-success" });
        if (material.kind === 'teaser')
            return _jsx(ImageIcon, { size: 16, className: "text-zapusk-400" });
        return _jsx(FileText, { size: 16, className: "text-secondary" });
    }, [material.kind]);
    async function copyPrompt() {
        if (!publicPrompt)
            return;
        await navigator.clipboard.writeText(publicPrompt);
    }
    async function approve() {
        if (!onSaveReview)
            return;
        setModalAction('approve');
        try {
            await onSaveReview({
                score: review?.score ?? 5,
                comment: comment.trim(),
                approved: true,
                needsRework: false,
            });
            setPromptOpen(false);
        }
        finally {
            setModalAction(null);
        }
    }
    async function sendForRework() {
        if (!canRework || !comment.trim())
            return;
        setModalAction('rework');
        try {
            if (onSaveReview) {
                await onSaveReview({
                    score: review?.score ?? 3,
                    comment: comment.trim(),
                    approved: false,
                    needsRework: true,
                });
            }
            await onRegenerateWithFeedback?.(comment.trim());
            setPromptOpen(false);
            setComment('');
        }
        finally {
            setModalAction(null);
        }
    }
    return (_jsxs(_Fragment, { children: [_jsxs(Card, { accent: material.phase === 'after' ? 'ai' : null, padded: true, className: "flex h-full flex-col", children: [_jsx("div", { className: "flex items-start justify-between gap-3", children: _jsxs("div", { className: "flex items-start gap-3 min-w-0", children: [_jsx("div", { className: "w-10 h-10 rounded-md bg-elevated border border-line flex items-center justify-center shrink-0", children: icon }), _jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-1.5 mb-1", children: [_jsx(StatusBadge, { tone: STATUS_TONES[status], dot: true, children: STATUS_LABELS[status] }), _jsxs(StatusBadge, { tone: material.phase === 'after' ? 'ai' : 'neutral', children: ["v", material.version] })] }), _jsx("h3", { className: "text-[15px] font-semibold text-primary leading-tight", children: material.title }), _jsx("p", { className: "text-xs text-muted mt-1 leading-relaxed", children: material.description })] })] }) }), _jsxs("div", { className: "mt-4 grid grid-cols-2 gap-2 text-[11px]", children: [_jsx(Meta, { label: "\u0424\u043E\u0440\u043C\u0430\u0442", value: material.format }), _jsx(Meta, { label: "\u0414\u0430\u0442\u0430", value: formatDate(material.date) }), _jsx(Meta, { label: "\u0412\u0435\u0440\u0441\u0438\u044F", value: material.phase === 'before' ? 'Было' : 'Стало' }), _jsx(Meta, { label: "\u0417\u0430\u0434\u0430\u043D\u0438\u0435", value: promptVersion ? `v${promptVersion}` : material.promptKind ? 'нужно сформировать' : 'не требуется' })] }), _jsxs("div", { className: "mt-4 pt-4 border-t border-hairline grid grid-cols-2 gap-2", children: [_jsx(Button, { size: "sm", variant: "secondary", iconLeft: _jsx(ExternalLink, { size: 12 }), onClick: () => window.open(material.url, '_blank', 'noreferrer'), children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C" }), _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(Download, { size: 12 }), disabled: !material.downloadUrl, onClick: () => material.downloadUrl && window.open(material.downloadUrl, '_blank', 'noreferrer'), children: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C" }), _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(MessageSquarePlus, { size: 12 }), disabled: !canRework, onClick: () => setPromptOpen(true), children: "\u0414\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C" }), _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(FileText, { size: 12 }), disabled: !material.promptKind, onClick: () => setPromptOpen(true), children: "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0437\u0430\u0434\u0430\u043D\u0438\u0435" })] })] }), _jsx(Modal, { open: promptOpen, onClose: () => setPromptOpen(false), title: `Задание · ${material.title}`, width: "max-w-4xl", bodyClassName: "min-h-0 overflow-hidden", children: _jsxs("div", { className: "flex max-h-[calc(85vh-4.25rem)] flex-col", children: [_jsxs("div", { className: "min-h-0 flex-1 overflow-auto p-4 sm:p-5 space-y-4", children: [publicPrompt ? (_jsxs("div", { children: [_jsx("p", { className: "text-xs text-muted mb-2", children: "\u041F\u043E\u043B\u043D\u044B\u0439 \u0442\u0435\u043A\u0441\u0442 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430" }), _jsx("pre", { className: "bg-canvas border border-hairline rounded-md p-4 text-[12.5px] text-secondary leading-relaxed whitespace-pre-wrap font-num", children: publicPrompt })] })) : (_jsxs("div", { className: "bg-canvas/50 border border-dashed border-line rounded-md p-5 text-center", children: [_jsx("p", { className: "text-sm font-medium text-primary", children: "\u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u0435\u0449\u0451 \u043D\u0435 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E" }), _jsx("p", { className: "text-xs text-muted mt-1", children: "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u0443\u0439\u0442\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435, \u0447\u0442\u043E\u0431\u044B \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u043C\u043E\u0433\u043B\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u044D\u0442\u043E\u0442 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B \u043F\u043E \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F\u043C." }), onGeneratePrompt && (_jsx(Button, { className: "mt-4", variant: "ai", iconLeft: _jsx(RefreshCw, { size: 14 }), loading: regenerating, onClick: onGeneratePrompt, children: "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u043D\u0438\u0435" }))] })), _jsxs("div", { children: [_jsx(Textarea, { label: "\u0427\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C?", rows: 3, value: comment, onChange: (e) => setComment(e.target.value), placeholder: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F \u043A \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0443: \u0447\u0442\u043E \u0443\u0441\u0438\u043B\u0438\u0442\u044C, \u0443\u0431\u0440\u0430\u0442\u044C \u0438\u043B\u0438 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C" }), _jsx(VoiceInputButton, { className: "mt-2", onTranscript: (text) => setComment((current) => current.trim() ? `${current.trim()} ${text}` : text) })] })] }), _jsx("div", { className: "shrink-0 border-t border-hairline bg-elevated px-4 py-3 sm:px-5", children: _jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx(Button, { variant: "secondary", iconLeft: _jsx(CheckCircle2, { size: 14 }), onClick: approve, loading: modalAction === 'approve', disabled: !onSaveReview, children: "\u0423\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C" }), _jsx(Button, { variant: "ai", iconLeft: _jsx(MessageSquarePlus, { size: 14 }), onClick: sendForRework, loading: modalAction === 'rework' || regenerating, disabled: !comment.trim() || !canRework, children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { variant: "ghost", iconLeft: _jsx(Copy, { size: 14 }), onClick: copyPrompt, disabled: !publicPrompt, children: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442" }), _jsx(Button, { variant: "ghost", onClick: () => setPromptOpen(false), children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] })] }) })] }) })] }));
}
function Meta({ label, value }) {
    return (_jsxs("div", { className: "rounded-md border border-hairline bg-canvas/45 px-3 py-2", children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-0.5", children: label }), _jsx("div", { className: "text-xs text-primary truncate", children: value })] }));
}
