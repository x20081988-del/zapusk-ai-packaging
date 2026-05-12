import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Star, MessageSquare } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { ReviewBlock } from '../components/ui/ReviewBlock';
import { api } from '../lib/api';
import { PROMPT_KIND_LABELS, formatDate } from '../lib/format';
import { ALL_PROMPT_KINDS } from '../lib/promptKinds';
import { buildReviewIndex, computePackagingQualityScore, getReview } from '../lib/reviews';
export default function ProjectReview() {
    const { id } = useParams();
    const [project, setProject] = useState(null);
    const [reviews, setReviews] = useState([]);
    async function load() {
        if (!id)
            return;
        const [{ project: p }, { reviews: rs }] = await Promise.all([
            api.get(`/api/projects/${id}`),
            api.get(`/api/reviews/project/${id}`),
        ]);
        setProject(p);
        setReviews(rs);
    }
    useEffect(() => { load(); }, [id]);
    const idx = useMemo(() => buildReviewIndex(reviews), [reviews]);
    // Expected keys: brief + 10 prompts
    const expectedKeys = useMemo(() => ['brief:brief', ...ALL_PROMPT_KINDS.map((k) => `prompt:${k}`)], []);
    const pqs = useMemo(() => computePackagingQualityScore(reviews, expectedKeys), [reviews, expectedKeys]);
    async function saveReview(payload) {
        if (!id)
            return;
        await api.post('/api/reviews', { projectId: id, ...payload });
        await load();
    }
    if (!project) {
        return _jsx(AppLayout, { title: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432", children: _jsx(Card, { children: _jsx("div", { className: "text-sm text-muted text-center py-8", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }) }) });
    }
    const briefReview = getReview(idx, 'brief', 'brief');
    return (_jsxs(AppLayout, { title: `${project.name} · Проверка материалов`, action: _jsx(Link, { to: `/projects/${id}`, children: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(ArrowLeft, { size: 14 }), children: "\u041A \u043F\u0440\u043E\u0435\u043A\u0442\u0443" }) }), children: [_jsxs(Card, { padded: true, className: "mb-6 relative overflow-hidden", children: [_jsx("div", { className: "absolute -top-16 -right-16 w-64 h-64 bg-zapusk/10 rounded-full blur-3xl" }), _jsxs("div", { className: "relative grid grid-cols-1 lg:grid-cols-3 gap-6 items-center", children: [_jsxs("div", { className: "lg:col-span-2", children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-2", children: "\u041E\u0446\u0435\u043D\u043A\u0430 \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432" }), _jsxs("div", { className: "flex items-end gap-4", children: [_jsx("div", { className: "text-6xl font-bold text-primary font-num tracking-tight", children: pqs.score }), _jsx("div", { className: "text-2xl text-muted font-num pb-2", children: "/ 100" })] }), _jsx("p", { className: "text-sm text-secondary mt-3 max-w-md", children: "\u0421\u0440\u0435\u0434\u043D\u044F\u044F \u043E\u0446\u0435\u043D\u043A\u0430 \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432. \u041D\u0435\u043E\u0446\u0435\u043D\u0451\u043D\u043D\u044B\u0435 \u043F\u043E\u0437\u0438\u0446\u0438\u0438 \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u043F\u0440\u043E\u0431\u0435\u043B\u0430\u043C\u0438, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u0447\u0435\u043C \u0431\u043E\u043B\u044C\u0448\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u0438 \u043E\u0434\u043E\u0431\u0440\u0435\u043D\u044B \u2014 \u0442\u0435\u043C \u0432\u044B\u0448\u0435 \u0438\u0442\u043E\u0433\u043E\u0432\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430." })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Stat, { label: "\u041E\u0446\u0435\u043D\u0435\u043D\u043E", value: `${pqs.reviewedCount} / ${pqs.totalCount}` }), _jsx(Stat, { label: "\u0413\u043E\u0434\u0438\u0442\u0441\u044F \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", value: String(reviews.filter((r) => r.approved).length), tone: "success" }), _jsx(Stat, { label: "\u041D\u0443\u0436\u043D\u043E \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C", value: String(reviews.filter((r) => r.needsRework).length), tone: "warning" })] })] })] }), _jsxs(Card, { padded: true, accent: "ai", className: "mb-6", children: [_jsx(CardHeader, { title: "\u0411\u0440\u0438\u0444 \u0438 \u0431\u0438\u0437\u043D\u0435\u0441 \u043D\u0430 \u0441\u0430\u043B\u0444\u0435\u0442\u043A\u0435", subtitle: project.brief ? `v${project.brief.version} · обновлён ${formatDate(project.brief.updatedAt)}` : 'не сгенерирован', action: briefReview?.score ? _jsx(ScoreChip, { score: briefReview.score }) : null }), project.brief ? (_jsx(ReviewBlock, { current: briefReview, onSave: (payload) => saveReview({
                            artefactKind: 'brief',
                            artefactKey: 'brief',
                            artefactId: project.brief?.id,
                            ...payload,
                        }) })) : (_jsx(EmptyState, { title: "\u0411\u0440\u0438\u0444 \u0435\u0449\u0451 \u043D\u0435 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D" }))] }), _jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B", subtitle: "\u041E\u0446\u0435\u043D\u043A\u0430 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u043E\u0439 Zapusk" }), _jsx("div", { className: "space-y-3", children: ALL_PROMPT_KINDS.map((kind) => {
                            const latest = project.generatedPrompts?.find((p) => p.kind === kind);
                            const review = getReview(idx, 'prompt', kind);
                            const meta = PROMPT_KIND_LABELS[kind];
                            return (_jsxs("div", { className: "rounded-md border border-hairline bg-canvas/40 p-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h3", { className: "text-sm font-semibold text-primary", children: meta.title }), latest ? _jsxs(StatusBadge, { tone: meta.accent, dot: true, children: ["v", latest.version] }) : _jsx(StatusBadge, { tone: "neutral", children: "\u043D\u0435 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D" }), review?.approved && _jsx(StatusBadge, { tone: "success", dot: true, children: "\u0413\u043E\u0434\u0438\u0442\u0441\u044F" }), review?.needsRework && _jsx(StatusBadge, { tone: "warning", dot: true, children: "\u0414\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C" })] }), _jsx("p", { className: "text-xs text-muted mt-0.5", children: meta.subtitle }), review?.comment && (_jsxs("div", { className: "mt-2 flex items-start gap-1.5 text-xs text-secondary", children: [_jsx(MessageSquare, { size: 11, className: "text-muted mt-0.5 shrink-0" }), _jsx("span", { className: "leading-snug", children: review.comment })] }))] }), review?.score ? _jsx(ScoreChip, { score: review.score }) : _jsx("span", { className: "text-[11px] text-faint uppercase tracking-wide", children: "\u0431\u0435\u0437 \u043E\u0446\u0435\u043D\u043A\u0438" })] }), latest && (_jsx(ReviewBlock, { current: review, onSave: (payload) => saveReview({
                                            artefactKind: 'prompt',
                                            artefactKey: kind,
                                            artefactId: latest.id,
                                            ...payload,
                                        }), compact: true }))] }, kind));
                        }) })] })] }));
}
function Stat({ label, value, tone }) {
    return (_jsxs("div", { className: "flex items-center justify-between px-4 py-3 rounded-md bg-canvas/50 border border-hairline", children: [_jsx("span", { className: "text-[11px] uppercase tracking-[0.08em] text-muted", children: label }), _jsx("span", { className: `text-sm font-semibold font-num ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-primary'}`, children: value })] }));
}
function ScoreChip({ score }) {
    return (_jsxs("span", { className: "inline-flex items-center gap-1 px-2 h-7 rounded-full bg-zapusk/12 border border-zapusk/30 text-zapusk-400 text-[12px] font-semibold font-num", children: [_jsx(Star, { size: 11, fill: "currentColor" }), " ", score, "/5"] }));
}
