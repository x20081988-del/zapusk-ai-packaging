import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sparkles, FileText, Download, ArrowLeft, ExternalLink, Trash2, Link2, Rocket, ChevronRight, Wand2, Package, MessageCircle, } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { StepCard } from '../components/ui/StepCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ProjectMaterialCard } from '../components/ui/ProjectMaterialCard';
import { TransformationShowcase } from '../components/ui/TransformationShowcase';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { UploadZone } from '../components/ui/UploadZone';
import { api } from '../lib/api';
import { formatMoney, formatPercent, formatDate, parseObj, STAGE_LABELS, INVESTOR_TYPE_LABELS, } from '../lib/format';
import { computeProgress } from '../lib/progress';
import { buildReviewIndex, getReview } from '../lib/reviews';
import { getDemoMaterials, getDemoTransformationCase } from '../lib/demoMaterials';
import { MissingDataPanel } from '../components/ui/MissingDataPanel';
import { PersonalManagerCard } from '../components/ui/PersonalManagerCard';
import { RecentMeetings } from '../components/ui/RecentMeetings';
import { ProjectJourney } from '../components/ui/ProjectJourney';
import { DEFAULT_PROJECT_JOURNEY } from '../lib/projectJourney';
export default function ProjectCockpit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [generatingBrief, setGeneratingBrief] = useState(false);
    const [generatingKind, setGeneratingKind] = useState(null);
    const [generatingFull, setGeneratingFull] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [reviews, setReviews] = useState([]);
    async function load() {
        if (!id)
            return;
        const [p, rs] = await Promise.all([
            api.get(`/api/projects/${id}`),
            api.get(`/api/reviews/project/${id}`),
        ]);
        setProject(p.project);
        setReviews(rs.reviews);
    }
    useEffect(() => { load(); }, [id]);
    if (!project) {
        return (_jsx(AppLayout, { title: "\u041F\u0440\u043E\u0435\u043A\u0442", children: _jsx(Card, { children: _jsx("div", { className: "text-sm text-muted text-center py-8", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }) }) }));
    }
    const { steps, percent } = computeProgress(project);
    const napkin = parseObj(project.brief?.napkin, {});
    async function uploadFiles(files) {
        if (!id || files.length === 0)
            return;
        const form = new FormData();
        form.append('category', 'pitch');
        files.forEach((f) => form.append('files', f));
        await api.upload(`/api/files/${id}/upload`, form);
        load();
    }
    async function addLink(url, note) {
        if (!id)
            return;
        await api.post(`/api/files/${id}/link`, { url, note, category: 'reference' });
        load();
    }
    async function removeFile(fileId) {
        if (!id)
            return;
        await api.delete(`/api/files/${id}/${fileId}`);
        load();
    }
    async function generateBrief() {
        if (!id)
            return;
        setGeneratingBrief(true);
        try {
            await api.post(`/api/brief/${id}/generate`);
            await load();
        }
        finally {
            setGeneratingBrief(false);
        }
    }
    async function generatePrompt(kind) {
        if (!id)
            return;
        setGeneratingKind(kind);
        try {
            await api.post(`/api/prompts/${id}/generate/${kind}`);
            await load();
        }
        finally {
            setGeneratingKind(null);
        }
    }
    async function generateFullPackaging() {
        if (!id)
            return;
        setGeneratingFull(true);
        try {
            await api.post(`/api/prompts/${id}/generate-full-packaging`);
            await load();
        }
        finally {
            setGeneratingFull(false);
        }
    }
    async function regenerateWithFeedback(kind, feedback) {
        if (!id)
            return;
        setGeneratingKind(kind);
        try {
            await api.post(`/api/prompts/${id}/generate/${kind}`, { feedback });
            await load();
        }
        finally {
            setGeneratingKind(null);
        }
    }
    async function saveReview(kind, latestId, payload) {
        if (!id)
            return;
        await api.post('/api/reviews', {
            projectId: id,
            artefactKind: 'prompt',
            artefactKey: kind,
            artefactId: latestId,
            ...payload,
        });
        await load();
    }
    const reviewIndex = buildReviewIndex(reviews);
    const transformation = getDemoTransformationCase(project);
    const materials = getDemoMaterials(project);
    function latestPromptFor(kind) {
        return project.generatedPrompts?.find((p) => p.kind === kind);
    }
    return (_jsxs(AppLayout, { title: project.name, action: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(ArrowLeft, { size: 14 }), onClick: () => navigate('/dashboard'), children: "\u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u0441\u0442\u043E\u043B" }), _jsx(Link, { to: `/projects/${id}/review`, children: _jsx(Button, { variant: "secondary", size: "sm", children: "\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432" }) }), _jsx(Link, { to: "/personal-manager", children: _jsx(Button, { variant: "secondary", size: "sm", iconLeft: _jsx(MessageCircle, { size: 14 }), children: "\u041C\u0435\u043D\u0435\u0434\u0436\u0435\u0440" }) }), _jsx("a", { href: `/api/projects/${id}/export/zip`, children: _jsx(Button, { variant: "secondary", size: "sm", iconLeft: _jsx(Package, { size: 14 }), children: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442" }) }), _jsx("a", { href: `/api/projects/${id}/export`, target: "_blank", rel: "noreferrer", children: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(Download, { size: 14 }), children: "\u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430" }) })] }), children: [_jsxs(Card, { padded: true, className: "mb-6 relative overflow-hidden", children: [_jsx("div", { className: "absolute -top-16 -right-16 w-64 h-64 bg-zapusk/10 rounded-full blur-3xl" }), _jsxs("div", { className: "relative grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsxs("div", { className: "lg:col-span-2", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx(StatusBadge, { tone: percent > 0 ? 'zapusk' : 'neutral', dot: true, children: percent > 0 ? 'Материалы' : 'Черновик' }), _jsx("span", { className: "text-[11px] uppercase tracking-[0.1em] text-muted", children: project.industry ?? 'Отрасль не указана' })] }), _jsx("h1", { className: "text-3xl font-bold text-primary tracking-tight", children: project.name }), project.website && (_jsxs("a", { href: project.website, target: "_blank", rel: "noreferrer", className: "inline-flex items-center gap-1 text-xs text-secondary hover:text-zapusk-400 mt-1.5", children: [project.website, " ", _jsx(ExternalLink, { size: 11 })] })), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4 mt-6", children: [_jsx(Metric, { label: "\u041F\u0440\u0438\u0432\u043B\u0435\u043A\u0430\u0435\u0442", value: formatMoney(project.raiseAmount, project.currency), accent: "zapusk" }), _jsx(Metric, { label: "\u0414\u043E\u043B\u044F", value: formatPercent(project.equityOffered) }), _jsx(Metric, { label: "Min \u0447\u0435\u043A", value: formatMoney(project.minCheck, project.currency) }), _jsx(Metric, { label: "\u0421\u0442\u0430\u0434\u0438\u044F", value: STAGE_LABELS[project.stage ?? ''] ?? '—' }), _jsx(Metric, { label: "\u0422\u0438\u043F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430", value: INVESTOR_TYPE_LABELS[project.investorType ?? ''] ?? '—' }), _jsx(Metric, { label: "\u0421\u0440\u043E\u043A", value: formatDate(project.raiseDeadline) }), _jsx(Metric, { label: "\u0418\u041D\u041D", value: project.inn ?? '—' }), _jsx(Metric, { label: "\u0424\u043E\u0440\u043C\u0430", value: project.legalStatus ?? '—' })] })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "rounded-lg border border-line bg-canvas/50 p-5", children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.12em] text-muted font-semibold mb-1", children: "\u0413\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432" }), _jsxs("div", { className: "text-4xl font-bold text-primary font-num", children: [percent, "%"] }), _jsx("div", { className: "mt-3 h-1.5 bg-hairline rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-grad-zapusk transition-all duration-700", style: { width: `${percent}%` } }) })] }), _jsx(Button, { variant: "primary", size: "md", className: "w-full", iconLeft: _jsx(Wand2, { size: 14 }), loading: generatingFull, onClick: generateFullPackaging, children: "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E\u043B\u043D\u044B\u0439 \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432" }), _jsx(Button, { variant: "ai", size: "md", className: "w-full", iconLeft: _jsx(Sparkles, { size: 14 }), loading: generatingBrief, onClick: generateBrief, children: project.brief ? `Только бриф (v${project.brief.version + 1})` : 'Только бриф' })] })] })] }), transformation && _jsx(TransformationShowcase, { item: transformation }), _jsxs(Card, { padded: true, className: "mb-6", children: [_jsx(CardHeader, { title: "\u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432", subtitle: "\u041E\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u043E \u0433\u043E\u0442\u043E\u0432\u043E\u0433\u043E \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u0430 \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430" }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5", children: steps.map((s, i) => (_jsx(StepCard, { index: i + 1, label: s.label, done: s.done, current: !s.done && steps.slice(0, i).every((p) => p.done) }, s.key))) })] }), _jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 mb-6", children: [_jsx(ProjectJourney, { stages: DEFAULT_PROJECT_JOURNEY, compact: true }), _jsx(PersonalManagerCard, { compact: true })] }), _jsx("div", { className: "mb-6", children: _jsx(RecentMeetings, { projectId: id, limit: 3 }) }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6", children: [_jsxs(Card, { padded: true, className: "lg:col-span-1", children: [_jsx(CardHeader, { title: "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B", subtitle: `${project.files?.length ?? 0} загружено`, action: _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(Link2, { size: 12 }), onClick: () => setLinkOpen(true), children: "\u0421\u0441\u044B\u043B\u043A\u0430" }) }), _jsx(UploadZone, { onFiles: uploadFiles, hint: "\u041F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u044F, \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C, \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435, \u043B\u043E\u0433\u043E\u0442\u0438\u043F, \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u044B" }), project.files && project.files.length > 0 && (_jsx("ul", { className: "mt-4 space-y-2", children: project.files.map((f) => _jsx(FileRow, { file: f, onRemove: () => removeFile(f.id) }, f.id)) }))] }), _jsxs(Card, { padded: true, accent: project.brief ? 'ai' : null, className: "lg:col-span-2", children: [_jsx(CardHeader, { title: "\u0411\u0438\u0437\u043D\u0435\u0441 \u043D\u0430 \u0441\u0430\u043B\u0444\u0435\u0442\u043A\u0435", subtitle: project.brief ? `Разбор v${project.brief.version}` : 'Будет собран после генерации брифа', action: project.brief && (_jsx(Link, { to: `/projects/${id}/brief`, children: _jsx(Button, { variant: "ghost", size: "sm", iconRight: _jsx(ChevronRight, { size: 14 }), children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C" }) })) }), project.brief ? (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4", children: [_jsx(NapkinField, { label: "\u0427\u0442\u043E \u0437\u0430 \u0431\u0438\u0437\u043D\u0435\u0441", value: napkin.whatIs }), _jsx(NapkinField, { label: "\u041A\u0430\u043A \u0437\u0430\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442", value: napkin.howMakesMoney }), _jsx(NapkinField, { label: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043D\u0443\u0436\u043D\u043E", value: napkin.howMuchNeeded }), _jsx(NapkinField, { label: "\u041D\u0430 \u0447\u0442\u043E \u0434\u0435\u043D\u044C\u0433\u0438", value: napkin.whatFor }), _jsx(NapkinField, { label: "\u0414\u043E\u0445\u043E\u0434 \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430", value: napkin.investorReturn }), _jsx(NapkinField, { label: "\u041F\u043E\u0447\u0435\u043C\u0443 \u0441\u0435\u0439\u0447\u0430\u0441", value: napkin.whyNow })] })) : (_jsx(EmptyState, { icon: _jsx(Sparkles, { size: 20 }), title: "\u0411\u0440\u0438\u0444 \u0435\u0449\u0451 \u043D\u0435 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D", description: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u0438\u043D \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B \u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0431\u0440\u0438\u0444\u00BB. \u0415\u0441\u043B\u0438 \u0434\u0430\u043D\u043D\u044B\u0445 \u043C\u0430\u043B\u043E, \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0441\u043E\u0431\u0435\u0440\u0451\u0442 \u0430\u043A\u043A\u0443\u0440\u0430\u0442\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A.", action: _jsx(Button, { variant: "ai", iconLeft: _jsx(Sparkles, { size: 14 }), loading: generatingBrief, onClick: generateBrief, children: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C" }) }))] })] }), project.brief && (_jsx("div", { className: "mb-6", children: _jsx(MissingDataPanel, { rawJson: project.brief.missingByCategory, interviewHref: `/projects/${id}/interview` }) })), _jsxs(Card, { padded: true, className: "mb-6", children: [_jsx(CardHeader, { title: "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B", subtitle: "\u0417\u0434\u0435\u0441\u044C \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0433\u043E\u0442\u043E\u0432\u044B\u0435 \u0438\u043D\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u043E\u043D\u043D\u044B\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0430: \u043F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u0438, \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438, \u043F\u043E\u0441\u0430\u0434\u043E\u0447\u043D\u044B\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0438 \u043A\u0440\u0430\u0442\u043A\u0438\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u043E\u0432. \u0412\u044B \u043C\u043E\u0436\u0435\u0442\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B, \u0441\u043A\u0430\u0447\u0430\u0442\u044C \u0435\u0433\u043E, \u0443\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438\u043B\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443. \u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E.", action: _jsx(Link, { to: `/projects/${id}/packaging`, children: _jsx(Button, { variant: "ghost", size: "sm", iconRight: _jsx(ChevronRight, { size: 14 }), children: "\u0412\u0441\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B" }) }) }), materials.length === 0 ? (_jsx(EmptyState, { icon: _jsx(FileText, { size: 20 }), title: "\u0413\u043E\u0442\u043E\u0432\u044B\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u044B", description: "\u041F\u043E\u0441\u043B\u0435 \u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0438 \u0437\u0434\u0435\u0441\u044C \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u0438, \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438, \u043F\u043E\u0441\u0430\u0434\u043E\u0447\u043D\u044B\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0438 \u043A\u0440\u0430\u0442\u043A\u0438\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u043E\u0432." })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: materials.slice(0, 6).map((material) => {
                            const kind = material.promptKind;
                            const latest = kind ? latestPromptFor(kind) : undefined;
                            const review = kind ? getReview(reviewIndex, 'prompt', kind) : undefined;
                            return (_jsx(ProjectMaterialCard, { material: material, promptBody: latest?.body, promptVersion: latest?.version, review: review, regenerating: kind ? generatingKind === kind : false, onGeneratePrompt: kind ? () => generatePrompt(kind) : undefined, onRegenerateWithFeedback: kind ? (feedback) => regenerateWithFeedback(kind, feedback) : undefined, onSaveReview: kind ? (p) => saveReview(kind, latest?.id, p) : undefined }, material.id));
                        }) }))] }), _jsx(Card, { padded: true, className: "bg-gradient-to-br from-surface to-canvas border-zapusk/20", children: _jsxs("div", { className: "flex items-start gap-4", children: [_jsx("div", { className: "w-12 h-12 rounded-lg bg-grad-zapusk shadow-glow flex items-center justify-center flex-shrink-0", children: _jsx(Rocket, { size: 18, className: "text-canvas" }) }), _jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "text-base font-semibold text-primary", children: "\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0435 \u0448\u0430\u0433\u0438" }), _jsxs("p", { className: "text-sm text-secondary mt-1", children: [percent < 30 && 'Загрузите презентацию или описание проекта — система соберёт первый бриф.', percent >= 30 && percent < 60 && 'Откройте интервью по проекту и ответьте на 5-7 уточняющих вопросов.', percent >= 60 && percent < 100 && 'Сформируйте оставшиеся задания и скачайте одностраничник.', percent === 100 && 'Материалы готовы — скачайте комплект и передайте команде.'] })] }), _jsx(Link, { to: `/projects/${id}/packaging`, children: _jsx(Button, { iconRight: _jsx(ChevronRight, { size: 14 }), children: "\u041A \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430\u043C \u043F\u0440\u043E\u0435\u043A\u0442\u0430" }) })] }) }), _jsx(AddLinkModal, { open: linkOpen, onClose: () => setLinkOpen(false), onAdd: addLink })] }));
}
function Metric({ label, value, accent }) {
    return (_jsxs("div", { children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1", children: label }), _jsx("div", { className: `text-[15px] font-semibold font-num truncate ${accent === 'zapusk' ? 'text-zapusk-400' : 'text-primary'}`, children: value })] }));
}
function NapkinField({ label, value }) {
    return (_jsxs("div", { children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mb-1", children: label }), _jsx("div", { className: "text-sm text-primary leading-snug", children: value || _jsx("span", { className: "text-faint", children: "\u2014" }) })] }));
}
function FileRow({ file, onRemove }) {
    const isLink = Boolean(file.url);
    return (_jsxs("li", { className: "flex items-center gap-3 px-3 py-2 rounded-md bg-canvas/50 border border-hairline group", children: [_jsx("div", { className: "w-8 h-8 rounded-md bg-surface border border-line flex items-center justify-center flex-shrink-0", children: isLink ? _jsx(Link2, { size: 13, className: "text-secondary" }) : _jsx(FileText, { size: 13, className: "text-secondary" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-xs font-medium text-primary truncate", children: file.originalName }), _jsx("div", { className: "text-[10px] text-muted", children: isLink ? file.url : `${Math.round(file.size / 1024)} КБ · ${file.category}` })] }), _jsx("button", { onClick: onRemove, className: "text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity", children: _jsx(Trash2, { size: 13 }) })] }));
}
function AddLinkModal({ open, onClose, onAdd }) {
    const [url, setUrl] = useState('');
    const [note, setNote] = useState('');
    return (_jsx(Modal, { open: open, onClose: onClose, title: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0443", children: _jsxs("div", { className: "p-5 space-y-4", children: [_jsx(Input, { label: "\u0421\u0441\u044B\u043B\u043A\u0430", value: url, onChange: (e) => setUrl(e.target.value), placeholder: "https://docs.google.com/\u2026" }), _jsx(Input, { label: "\u041F\u043E\u0434\u043F\u0438\u0441\u044C", value: note, onChange: (e) => setNote(e.target.value), placeholder: "\u0424\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C" }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { variant: "ghost", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { onClick: () => { onAdd(url, note); setUrl(''); setNote(''); onClose(); }, children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" })] })] }) }));
}
