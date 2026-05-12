import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, AlertTriangle, CheckCircle2, HelpCircle, Activity } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Select, Textarea } from '../components/ui/Input';
import { api } from '../lib/api';
import { parseList, parseObj } from '../lib/format';
import { MissingDataPanel } from '../components/ui/MissingDataPanel';
import { VoiceInputButton } from '../components/ui/VoiceInputButton';
const FOCUS_OPTIONS = [
    { value: 'narrative', label: 'История проекта' },
    { value: 'finance', label: 'Финансы' },
    { value: 'risks', label: 'Риски' },
    { value: 'investor_offer', label: 'Предложение инвестору' },
    { value: 'missing_data', label: 'Недостающие данные' },
];
export default function ProjectBrief() {
    const { id } = useParams();
    const [project, setProject] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [focus, setFocus] = useState(FOCUS_OPTIONS[0].value);
    const [improving, setImproving] = useState(false);
    const [feedbackStatus, setFeedbackStatus] = useState(null);
    async function load() {
        if (!id)
            return;
        const r = await api.get(`/api/projects/${id}`);
        setProject(r.project);
    }
    useEffect(() => { load(); }, [id]);
    async function regenerate() {
        if (!id)
            return;
        setGenerating(true);
        try {
            await api.post(`/api/brief/${id}/generate`);
            await load();
        }
        finally {
            setGenerating(false);
        }
    }
    async function improveBrief() {
        if (!id || !feedback.trim())
            return;
        setImproving(true);
        setFeedbackStatus(null);
        try {
            const result = await api.post(`/api/brief/${id}/regenerate-with-feedback`, {
                feedback: feedback.trim(),
                focus,
            });
            if (result.brief) {
                setProject((current) => (current ? { ...current, brief: result.brief } : current));
                setFeedbackStatus(`Бриф обновлён до v${result.brief.version}.`);
            }
            setFeedback('');
            await load();
        }
        finally {
            setImproving(false);
        }
    }
    if (!project) {
        return _jsx(AppLayout, { title: "\u0411\u0440\u0438\u0444", children: _jsx(Card, { children: _jsx("div", { className: "text-sm text-muted text-center py-8", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }) }) });
    }
    const brief = project.brief;
    const napkin = parseObj(brief?.napkin, {});
    const strengths = parseList(brief?.strengths);
    const weaknesses = parseList(brief?.weaknesses);
    const missing = parseList(brief?.missingData);
    const metrics = parseObj(brief?.keyMetrics, {});
    return (_jsx(AppLayout, { title: `${project.name} · Бриф`, action: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Link, { to: `/projects/${id}`, children: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(ArrowLeft, { size: 14 }), children: "\u041A \u043F\u0440\u043E\u0435\u043A\u0442\u0443" }) }), _jsx(Button, { variant: "ai", size: "sm", iconLeft: _jsx(Sparkles, { size: 14 }), loading: generating, onClick: regenerate, children: brief ? `v${brief.version + 1}` : 'Сгенерировать' })] }), children: !brief ? (_jsx(Card, { padded: true, children: _jsx(EmptyState, { icon: _jsx(Sparkles, { size: 20 }), title: "\u0411\u0440\u0438\u0444 \u0435\u0449\u0451 \u043D\u0435 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D", description: "\u041F\u043E\u0441\u043B\u0435 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0437\u0434\u0435\u0441\u044C \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F: \u0431\u0438\u0437\u043D\u0435\u0441-\u0440\u0435\u0437\u044E\u043C\u0435, \u043C\u043E\u043D\u0435\u0442\u0438\u0437\u0430\u0446\u0438\u044F, \u043A\u043B\u044E\u0447\u0435\u0432\u044B\u0435 \u043C\u0435\u0442\u0440\u0438\u043A\u0438, \u0438\u043D\u0432\u0435\u0441\u0442-\u0437\u0430\u043F\u0440\u043E\u0441, \u0441\u0438\u043B\u044C\u043D\u044B\u0435 \u0441\u0442\u043E\u0440\u043E\u043D\u044B, \u0441\u043B\u0430\u0431\u044B\u0435 \u043C\u0435\u0441\u0442\u0430, \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0438 \u00AB\u0431\u0438\u0437\u043D\u0435\u0441 \u043D\u0430 \u0441\u0430\u043B\u0444\u0435\u0442\u043A\u0435\u00BB.", action: _jsx(Button, { variant: "ai", loading: generating, onClick: regenerate, iconLeft: _jsx(Sparkles, { size: 14 }), children: "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0431\u0440\u0438\u0444" }) }) })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs(StatusBadge, { tone: "ai", dot: true, children: ["v", brief.version] }), _jsxs("span", { className: "text-xs text-muted", children: ["\u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D ", new Date(brief.updatedAt).toLocaleString('ru-RU')] })] }), _jsxs(Card, { padded: true, accent: "ai", children: [_jsx(CardHeader, { title: "\u0414\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0431\u0440\u0438\u0444 \u043F\u043E \u0437\u0430\u043C\u0435\u0447\u0430\u043D\u0438\u044F\u043C", subtitle: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442 \u0431\u0440\u0438\u0444 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0438 \u00AB\u0431\u0438\u0437\u043D\u0435\u0441 \u043D\u0430 \u0441\u0430\u043B\u0444\u0435\u0442\u043A\u0435\u00BB. \u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u044F \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432 \u0432\u043E\u0437\u044C\u043C\u0451\u0442 \u0443\u0436\u0435 \u044D\u0442\u0443 \u0432\u0435\u0440\u0441\u0438\u044E." }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4", children: [_jsx(Select, { label: "\u0424\u043E\u043A\u0443\u0441", options: FOCUS_OPTIONS, value: focus, onChange: (e) => setFocus(e.target.value) }), _jsxs("div", { children: [_jsx(Textarea, { label: "\u0427\u0442\u043E \u0443\u043B\u0443\u0447\u0448\u0438\u0442\u044C \u0432 \u0431\u0440\u0438\u0444\u0435?", rows: 4, value: feedback, onChange: (e) => setFeedback(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0432 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0438 \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0443 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u0430\u043B\u043E \u043F\u0440\u043E \u0434\u043E\u0445\u043E\u0434, \u0434\u043E\u0431\u0430\u0432\u044C \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u0439 \u043E\u043A\u0443\u043F\u0430\u0435\u043C\u043E\u0441\u0442\u0438 \u0438 \u0443\u0442\u043E\u0447\u043D\u0438 \u0440\u0438\u0441\u043A\u0438 \u0441\u0435\u0437\u043E\u043D\u043D\u043E\u0441\u0442\u0438." }), _jsx(VoiceInputButton, { className: "mt-2", onTranscript: (text) => setFeedback((current) => current.trim() ? `${current.trim()} ${text}` : text) })] })] }), _jsxs("div", { className: "mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3", children: [_jsx("p", { className: "text-xs text-muted", children: "\u041E\u0442\u0432\u0435\u0442\u044B \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F, \u0430 \u0441\u043F\u0438\u0441\u043E\u043A \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0438\u0445 \u0434\u0430\u043D\u043D\u044B\u0445 \u043D\u0435 \u0441\u0431\u0440\u0430\u0441\u044B\u0432\u0430\u0435\u0442\u0441\u044F." }), _jsx(Button, { variant: "ai", iconLeft: _jsx(Sparkles, { size: 14 }), loading: improving, disabled: !feedback.trim(), onClick: improveBrief, children: "\u0414\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0431\u0440\u0438\u0444" })] }), feedbackStatus && _jsx("p", { className: "mt-3 text-xs text-success", children: feedbackStatus })] }), _jsxs(Card, { padded: true, accent: "ai", children: [_jsx(CardHeader, { title: "\u0411\u0438\u0437\u043D\u0435\u0441 \u043D\u0430 \u0441\u0430\u043B\u0444\u0435\u0442\u043A\u0435", subtitle: "\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0435 \u0440\u0435\u0437\u044E\u043C\u0435 \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5", children: [_jsx(Field, { label: "\u0427\u0442\u043E \u0437\u0430 \u0431\u0438\u0437\u043D\u0435\u0441", value: napkin.whatIs }), _jsx(Field, { label: "\u041A\u0430\u043A \u0437\u0430\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442", value: napkin.howMakesMoney }), _jsx(Field, { label: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043D\u0443\u0436\u043D\u043E \u0434\u0435\u043D\u0435\u0433", value: napkin.howMuchNeeded }), _jsx(Field, { label: "\u041D\u0430 \u0447\u0442\u043E \u0434\u0435\u043D\u044C\u0433\u0438", value: napkin.whatFor }), _jsx(Field, { label: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440", value: napkin.investorReturn }), _jsx(Field, { label: "\u041F\u043E\u0447\u0435\u043C\u0443 \u0441\u0435\u0439\u0447\u0430\u0441", value: napkin.whyNow })] }), Array.isArray(napkin.mainRisks) && napkin.mainRisks.length > 0 && (_jsxs("div", { className: "mt-6 pt-5 border-t border-hairline", children: [_jsx("div", { className: "text-[11px] uppercase tracking-[0.1em] text-muted font-semibold mb-2", children: "\u0413\u043B\u0430\u0432\u043D\u044B\u0435 \u0440\u0438\u0441\u043A\u0438" }), _jsx("ul", { className: "space-y-1.5", children: napkin.mainRisks.map((r, i) => (_jsxs("li", { className: "flex items-start gap-2 text-sm text-secondary", children: [_jsx(AlertTriangle, { size: 13, className: "text-warning mt-0.5 shrink-0" }), r] }, i))) })] }))] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [_jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u0411\u0438\u0437\u043D\u0435\u0441-\u0440\u0435\u0437\u044E\u043C\u0435" }), _jsx("p", { className: "text-sm text-secondary leading-relaxed", children: brief.businessSummary ?? '—' }), _jsxs("div", { className: "mt-4 pt-4 border-t border-hairline", children: [_jsx("div", { className: "text-[11px] uppercase tracking-[0.1em] text-muted font-semibold mb-1.5", children: "\u041C\u043E\u043D\u0435\u0442\u0438\u0437\u0430\u0446\u0438\u044F" }), _jsx("p", { className: "text-sm text-secondary leading-relaxed", children: brief.monetization ?? '—' })] })] }), _jsxs(Card, { padded: true, accent: "zapusk", children: [_jsx(CardHeader, { title: "\u0418\u043D\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u0437\u0430\u043F\u0440\u043E\u0441", subtitle: "\u0423\u0441\u043B\u043E\u0432\u0438\u044F \u0434\u043B\u044F \u0441\u0434\u0435\u043B\u043A\u0438" }), _jsx("p", { className: "text-sm text-primary leading-relaxed", children: brief.investmentAsk ?? '—' }), Object.keys(metrics).length > 0 && (_jsxs("div", { className: "mt-4 pt-4 border-t border-hairline", children: [_jsx("div", { className: "text-[11px] uppercase tracking-[0.1em] text-muted font-semibold mb-2", children: "\u041A\u043B\u044E\u0447\u0435\u0432\u044B\u0435 \u043C\u0435\u0442\u0440\u0438\u043A\u0438" }), _jsx("dl", { className: "space-y-1.5", children: Object.entries(metrics).map(([k, v]) => (_jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("dt", { className: "text-muted uppercase tracking-wide", children: k }), _jsx("dd", { className: "text-primary font-num text-right", children: v })] }, k))) })] }))] })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: [_jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u0421\u0438\u043B\u044C\u043D\u044B\u0435 \u0441\u0442\u043E\u0440\u043E\u043D\u044B" }), _jsx("ul", { className: "space-y-2", children: strengths.length ? strengths.map((s, i) => (_jsxs("li", { className: "flex items-start gap-2.5 text-sm text-secondary", children: [_jsx(CheckCircle2, { size: 14, className: "text-success mt-0.5 shrink-0" }), s] }, i))) : _jsx("li", { className: "text-sm text-muted", children: "\u2014" }) })] }), _jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u0421\u043B\u0430\u0431\u044B\u0435 \u043C\u0435\u0441\u0442\u0430" }), _jsx("ul", { className: "space-y-2", children: weaknesses.length ? weaknesses.map((s, i) => (_jsxs("li", { className: "flex items-start gap-2.5 text-sm text-secondary", children: [_jsx(Activity, { size: 14, className: "text-warning mt-0.5 shrink-0" }), s] }, i))) : _jsx("li", { className: "text-sm text-muted", children: "\u2014" }) })] })] }), _jsx(MissingDataPanel, { rawJson: brief.missingByCategory, interviewHref: `/projects/${id}/interview` }), brief.missingByCategory == null && missing.length > 0 && (_jsxs(Card, { padded: true, accent: "ai", children: [_jsx(CardHeader, { title: "\u0421\u043F\u0438\u0441\u043E\u043A \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u0439", subtitle: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043F\u0440\u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u043C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0438 \u0431\u0440\u0438\u0444\u0430" }), _jsx("ul", { className: "space-y-2", children: missing.map((q, i) => (_jsxs("li", { className: "flex items-start gap-3 px-3 py-2.5 rounded-md bg-canvas/50 border border-hairline", children: [_jsx(HelpCircle, { size: 14, className: "text-ai-glow mt-0.5 shrink-0" }), _jsx("span", { className: "text-sm text-secondary", children: q })] }, i))) })] }))] })) }));
}
function Field({ label, value }) {
    return (_jsxs("div", { children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1", children: label }), _jsx("div", { className: "text-sm text-primary leading-relaxed", children: value || _jsx("span", { className: "text-faint", children: "\u2014" }) })] }));
}
