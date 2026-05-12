import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { CheckCircle2, Copy, Download, FileText, MessageSquarePlus, RefreshCw, Sparkles, Star } from 'lucide-react';
import clsx from 'clsx';
import { Card } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { ReviewBlock } from './ReviewBlock';
import { Modal } from './Modal';
import { Textarea } from './Input';
import { VoiceInputButton } from './VoiceInputButton';
import { sanitizePublicText } from '../../lib/publicText';
export function GeneratedAssetCard({ title, subtitle, accent, version, body, review, onDownload, onRegenerate, onRegenerateWithFeedback, onSaveReview, regenerating, }) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [comment, setComment] = useState(review?.comment ?? '');
    const [modalAction, setModalAction] = useState(null);
    const hasContent = Boolean(body);
    const publicBody = sanitizePublicText(body);
    async function copyFullText() {
        if (!publicBody)
            return;
        await navigator.clipboard.writeText(publicBody);
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
            setDetailsOpen(false);
        }
        finally {
            setModalAction(null);
        }
    }
    async function sendForRework() {
        if (!onRegenerateWithFeedback || !comment.trim())
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
            await onRegenerateWithFeedback(comment.trim());
            setDetailsOpen(false);
            setComment('');
        }
        finally {
            setModalAction(null);
        }
    }
    return (_jsxs(_Fragment, { children: [_jsxs(Card, { accent: accent, padded: true, children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(Sparkles, { size: 12, className: accent === 'ai' ? 'text-ai-glow' : 'text-zapusk-400' }), _jsx("span", { className: clsx('text-[10px] uppercase tracking-[0.12em] font-semibold', accent === 'ai' ? 'text-ai-glow' : 'text-zapusk-400'), children: accent === 'ai' ? 'Задание' : 'Материал' })] }), _jsx("h3", { className: "text-[15px] font-semibold text-primary leading-tight", children: title }), _jsx("p", { className: "text-xs text-muted mt-1", children: subtitle })] }), _jsxs("div", { className: "flex items-center gap-1.5 shrink-0", children: [review?.approved && _jsx(StatusBadge, { tone: "success", dot: true, children: "\u0413\u043E\u0434\u0438\u0442\u0441\u044F" }), review?.needsRework && _jsx(StatusBadge, { tone: "warning", dot: true, children: "\u0414\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C" }), review?.score ? (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 h-6 rounded-full bg-zapusk/12 border border-zapusk/30 text-zapusk-400 text-[11px] font-semibold", children: [_jsx(Star, { size: 10, fill: "currentColor" }), " ", review.score, "/5"] })) : null, hasContent && version != null && (_jsxs(StatusBadge, { tone: accent, dot: true, children: ["v", version] }))] })] }), hasContent ? (_jsxs("div", { className: "bg-canvas border border-hairline rounded-md p-3 max-h-32 overflow-hidden mb-3 relative", children: [_jsxs("pre", { className: "text-[11px] text-secondary font-num whitespace-pre-wrap leading-relaxed", children: [publicBody.slice(0, 320), publicBody.length > 320 && '…'] }), _jsx("div", { className: "absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent pointer-events-none" })] })) : (_jsx("div", { className: "bg-canvas/50 border border-dashed border-line rounded-md p-4 mb-3 text-center", children: _jsx("p", { className: "text-xs text-muted", children: "\u041D\u0435 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u043E" }) })), _jsx("div", { className: "flex items-center gap-2 flex-wrap", children: hasContent ? (_jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", variant: "secondary", iconLeft: _jsx(FileText, { size: 12 }), onClick: () => setDetailsOpen(true), children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u0434\u0430\u043D\u0438\u0435" }), _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(Copy, { size: 12 }), onClick: copyFullText, children: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C" }), _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(Download, { size: 12 }), onClick: onDownload, children: "\u0422\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439 \u0444\u0430\u0439\u043B \u0434\u043B\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B" }), _jsx("div", { className: "flex-1" }), onRegenerateWithFeedback && (_jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(MessageSquarePlus, { size: 12 }), onClick: () => setDetailsOpen(true), children: "\u0414\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C" })), _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(RefreshCw, { size: 12 }), onClick: onRegenerate, loading: regenerating, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u043D\u043E\u0432\u043E" })] })) : (_jsx(Button, { size: "sm", variant: accent === 'ai' ? 'ai' : 'primary', iconLeft: _jsx(Sparkles, { size: 12 }), onClick: onRegenerate, loading: regenerating, children: "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C" })) }), hasContent && onSaveReview && (_jsx("div", { className: "mt-3", children: _jsx(ReviewBlock, { current: review, onSave: onSaveReview }) }))] }), hasContent && (_jsx(Modal, { open: detailsOpen, onClose: () => setDetailsOpen(false), title: `Задание · ${title}`, width: "max-w-4xl", bodyClassName: "min-h-0 overflow-hidden", children: _jsxs("div", { className: "flex max-h-[calc(85vh-4.25rem)] flex-col", children: [_jsxs("div", { className: "min-h-0 flex-1 overflow-auto p-4 sm:p-5 space-y-4", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs text-muted mb-2", children: "\u041F\u043E\u043B\u043D\u044B\u0439 \u0442\u0435\u043A\u0441\u0442 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0434\u043B\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B" }), _jsx("pre", { className: "bg-canvas border border-hairline rounded-md p-4 text-[12.5px] text-secondary leading-relaxed whitespace-pre-wrap font-num", children: publicBody })] }), _jsxs("div", { children: [_jsx(Textarea, { label: "\u0427\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C?", rows: 3, value: comment, onChange: (e) => setComment(e.target.value), placeholder: "\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F: \u0447\u0442\u043E \u0443\u0441\u0438\u043B\u0438\u0442\u044C, \u0443\u0431\u0440\u0430\u0442\u044C \u0438\u043B\u0438 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C" }), _jsx(VoiceInputButton, { className: "mt-2", onTranscript: (text) => setComment((current) => current.trim() ? `${current.trim()} ${text}` : text) })] })] }), _jsx("div", { className: "shrink-0 border-t border-hairline bg-elevated px-4 py-3 sm:px-5", children: _jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx(Button, { variant: "secondary", iconLeft: _jsx(CheckCircle2, { size: 14 }), onClick: approve, loading: modalAction === 'approve', disabled: !onSaveReview, children: "\u0423\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C" }), _jsx(Button, { variant: "ai", iconLeft: _jsx(MessageSquarePlus, { size: 14 }), onClick: sendForRework, loading: modalAction === 'rework' || regenerating, disabled: !comment.trim() || !onRegenerateWithFeedback, children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { variant: "ghost", iconLeft: _jsx(Copy, { size: 14 }), onClick: copyFullText, children: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442" }), _jsx(Button, { variant: "ghost", onClick: () => setDetailsOpen(false), children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] })] }) })] }) }))] }));
}
