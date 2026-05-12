import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, Save, Wand2, CheckCircle2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AIQuestionCard } from '../components/ui/AIQuestionCard';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api } from '../lib/api';
import { parseList, parseObj } from '../lib/format';
const CATEGORY_LABELS = {
    financial: 'Финансы',
    market: 'Рынок',
    team: 'Команда',
    deal: 'Условия сделки',
    unit_econ: 'Юнит-экономика',
    risks: 'Риски',
};
// Build a stable question list. Prefer the categorized shape (Sprint 3) and
// fall back to the flat array for older briefs. Questions are keyed by their
// text so answers survive minor wording tweaks across brief regenerations.
function collectQuestions(brief) {
    if (!brief)
        return [];
    const byCat = parseObj(brief.missingByCategory, {});
    const out = [];
    const seen = new Set();
    for (const [cat, items] of Object.entries(byCat)) {
        if (!Array.isArray(items))
            continue;
        for (const q of items) {
            if (!q || seen.has(q))
                continue;
            seen.add(q);
            out.push({ text: q, category: cat });
        }
    }
    const hasCategorizedQuestions = out.length > 0;
    if (!hasCategorizedQuestions) {
        for (const q of parseList(brief.missingData)) {
            if (!seen.has(q)) {
                seen.add(q);
                out.push({ text: q });
            }
        }
    }
    for (const a of parseObj(brief.interviewAnswers ?? null, [])) {
        if (!a.question || seen.has(a.question))
            continue;
        seen.add(a.question);
        out.push({ text: a.question, category: a.category });
    }
    return out;
}
function latestSavedAt(stored) {
    const latest = stored
        .map((a) => (a.savedAt ? new Date(a.savedAt).getTime() : 0))
        .filter((time) => Number.isFinite(time) && time > 0)
        .sort((a, b) => b - a)[0];
    return latest ? new Date(latest) : null;
}
export default function ProjectInterview() {
    const { id } = useParams();
    const [project, setProject] = useState(null);
    const [answers, setAnswers] = useState({});
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState(null);
    const [regenerating, setRegenerating] = useState(false);
    async function load() {
        if (!id)
            return;
        const r = await api.get(`/api/projects/${id}`);
        setProject(r.project);
        const stored = parseObj(r.project.brief?.interviewAnswers ?? null, []);
        const map = {};
        for (const a of stored)
            map[a.question] = a.answer;
        setAnswers(map);
        setSavedAt(latestSavedAt(stored));
    }
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
    const questions = useMemo(() => collectQuestions(project?.brief ?? null), [project]);
    const answeredCount = useMemo(() => questions.filter((q) => (answers[q.text] ?? '').trim().length > 0).length, [questions, answers]);
    async function save(opts = {}) {
        if (!id)
            return;
        setSaving(true);
        try {
            const payload = questions
                .map((q) => ({ question: q.text, answer: answers[q.text] ?? '', category: q.category }))
                .filter((a) => a.answer.trim().length > 0);
            const result = await api.patch(`/api/brief/${id}/interview`, { answers: payload });
            if (result.brief)
                setProject((current) => (current ? { ...current, brief: result.brief } : current));
            setSavedAt(new Date());
            if (opts.thenRegenerate) {
                setRegenerating(true);
                await api.post(`/api/brief/${id}/generate`);
                await load();
            }
        }
        finally {
            setSaving(false);
            setRegenerating(false);
        }
    }
    return (_jsx(AppLayout, { title: project ? `${project.name} · Интервью по проекту` : 'Интервью по проекту', action: _jsx(Link, { to: `/projects/${id}`, children: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(ArrowLeft, { size: 14 }), children: "\u041A \u043F\u0440\u043E\u0435\u043A\u0442\u0443" }) }), children: _jsxs("div", { className: "max-w-readable mx-auto", children: [_jsxs("div", { className: "mb-6 flex items-end justify-between gap-4", children: [_jsxs("div", { children: [_jsxs("div", { className: "inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-ai-glow font-semibold mb-2", children: [_jsx(Sparkles, { size: 12 }), " \u0418\u043D\u0442\u0435\u0440\u0432\u044C\u044E \u043F\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0443"] }), _jsx("h1", { className: "text-2xl font-bold text-primary tracking-tight", children: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0435\u0435" }), _jsx("p", { className: "text-sm text-secondary mt-1.5 max-w-readable", children: "\u0421\u0438\u0441\u0442\u0435\u043C\u0430 \u0437\u0430\u0434\u0430\u0451\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u043E, \u0447\u0435\u0433\u043E \u043D\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0434\u043B\u044F \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u0438\u043D\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u043E\u043D\u043D\u043E\u0439 \u043F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u0438. \u041D\u0435 \u0434\u043B\u0438\u043D\u043D\u0430\u044F \u0430\u043D\u043A\u0435\u0442\u0430 \u2014 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0435 \u0432\u043E\u043F\u0440\u043E\u0441\u044B." })] }), questions.length > 0 && (_jsxs("div", { className: "flex flex-col items-end gap-1.5", children: [_jsxs(StatusBadge, { tone: answeredCount === questions.length ? 'success' : 'ai', dot: true, children: [answeredCount, " / ", questions.length, " \u043E\u0442\u0432\u0435\u0442\u043E\u0432"] }), savedAt && (_jsxs("span", { className: "text-[10px] uppercase tracking-[0.08em] text-muted", children: ["\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E ", savedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })] }))] }))] }), questions.length === 0 ? (_jsx(Card, { padded: true, children: _jsx(EmptyState, { title: project?.brief ? 'Базовые блоки покрыты' : 'Сначала сгенерируйте бриф', description: project?.brief
                            ? 'Существенных пробелов не найдено. Можно переходить к материалам проекта.'
                            : 'Сформируйте бриф на странице проекта — после этого здесь появятся уточняющие вопросы.', action: _jsx(Link, { to: `/projects/${id}`, children: _jsx(Button, { variant: "secondary", children: "\u041A \u043F\u0440\u043E\u0435\u043A\u0442\u0443" }) }) }) })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "space-y-3", children: questions.map((q, i) => (_jsx(AIQuestionCard, { index: i + 1, question: q.text, category: q.category ? CATEGORY_LABELS[q.category] ?? q.category : undefined, value: answers[q.text] ?? '', onChange: (v) => setAnswers((a) => ({ ...a, [q.text]: v })) }, q.text))) }), _jsxs("div", { className: "mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-4 rounded-lg bg-surface border border-line", children: [_jsxs("div", { className: "text-xs text-secondary flex items-start gap-2", children: [_jsx(CheckCircle2, { size: 13, className: "text-success mt-0.5 shrink-0" }), _jsx("span", { children: "\u041E\u0442\u0432\u0435\u0442\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0432 \u0431\u0440\u0438\u0444. \u041F\u043E\u043B\u043D\u044B\u0439 \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432 \u0431\u0443\u0434\u0435\u0442 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u0438\u0445 \u0432 \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430\u0445 \u0434\u043B\u044F \u0432\u0441\u0442\u0440\u0435\u0447\u0438 \u0441 \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u043E\u043C." })] }), _jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [_jsx(Button, { variant: "secondary", iconLeft: _jsx(Save, { size: 14 }), loading: saving && !regenerating, onClick: () => save(), children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx(Button, { variant: "ai", iconLeft: _jsx(Wand2, { size: 14 }), loading: regenerating, onClick: () => save({ thenRegenerate: true }), disabled: answeredCount === 0, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0431\u0440\u0438\u0444" })] })] })] }))] }) }));
}
