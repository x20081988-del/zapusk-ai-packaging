import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Wand2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProjectMaterialCard } from '../components/ui/ProjectMaterialCard';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import { getDemoMaterials } from '../lib/demoMaterials';
import { buildReviewIndex, getReview } from '../lib/reviews';
export default function ProjectPackaging() {
    const { id } = useParams();
    const [project, setProject] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [singleLoading, setSingleLoading] = useState(null);
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
    function latest(kind) {
        return project?.generatedPrompts?.find((p) => p.kind === kind);
    }
    async function regenerate(kind) {
        if (!id)
            return;
        setSingleLoading(kind);
        try {
            await api.post(`/api/prompts/${id}/generate/${kind}`);
            await load();
        }
        finally {
            setSingleLoading(null);
        }
    }
    async function generateAll() {
        if (!id)
            return;
        setBulkLoading(true);
        try {
            await api.post(`/api/prompts/${id}/generate-all`);
            await load();
        }
        finally {
            setBulkLoading(false);
        }
    }
    async function regenerateWithFeedback(kind, feedback) {
        if (!id)
            return;
        setSingleLoading(kind);
        try {
            await api.post(`/api/prompts/${id}/generate/${kind}`, { feedback });
            await load();
        }
        finally {
            setSingleLoading(null);
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
    const materials = getDemoMaterials(project);
    return (_jsx(AppLayout, { title: project ? `${project.name} · Материалы проекта` : 'Материалы проекта', action: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Link, { to: `/projects/${id}`, children: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(ArrowLeft, { size: 14 }), children: "\u041A \u043F\u0440\u043E\u0435\u043A\u0442\u0443" }) }), _jsx(Link, { to: `/projects/${id}/prompts`, children: _jsx(Button, { variant: "ghost", size: "sm", children: "\u0412\u0441\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F" }) }), _jsx(Button, { variant: "ai", size: "sm", iconLeft: _jsx(Wand2, { size: 14 }), loading: bulkLoading, onClick: generateAll, children: "\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0432\u0441\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B" })] }), children: _jsxs(Card, { padded: true, className: "mb-6", children: [_jsx(CardHeader, { title: "\u041C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0430", subtitle: "\u0417\u0434\u0435\u0441\u044C \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u0433\u043E\u0442\u043E\u0432\u044B\u0435 \u0438\u043D\u0432\u0435\u0441\u0442\u0438\u0446\u0438\u043E\u043D\u043D\u044B\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0430: \u043F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u0438, \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438, \u043F\u043E\u0441\u0430\u0434\u043E\u0447\u043D\u044B\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0438 \u043A\u0440\u0430\u0442\u043A\u0438\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u043E\u0432. \u0412\u044B \u043C\u043E\u0436\u0435\u0442\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B, \u0441\u043A\u0430\u0447\u0430\u0442\u044C \u0435\u0433\u043E, \u0443\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438\u043B\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u0430 \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u043A\u0443. \u0417\u0430\u0434\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E." }), materials.length === 0 ? (_jsx(EmptyState, { icon: _jsx(FileText, { size: 20 }), title: "\u0413\u043E\u0442\u043E\u0432\u044B\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u044B", description: "\u0414\u043B\u044F \u043D\u043E\u0432\u044B\u0445 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u0443\u0439\u0442\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F, \u0437\u0430\u0442\u0435\u043C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0433\u043E\u0442\u043E\u0432\u044B\u0435 \u043F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u0438, \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u043F\u043E\u0441\u0430\u0434\u043E\u0447\u043D\u044B\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B." })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: materials.map((material) => {
                        const kind = material.promptKind;
                        const cur = kind ? latest(kind) : undefined;
                        const review = kind ? getReview(reviewIndex, 'prompt', kind) : undefined;
                        return (_jsx(ProjectMaterialCard, { material: material, promptBody: cur?.body, promptVersion: cur?.version, review: review, regenerating: kind ? singleLoading === kind : false, onGeneratePrompt: kind ? () => regenerate(kind) : undefined, onRegenerateWithFeedback: kind ? (feedback) => regenerateWithFeedback(kind, feedback) : undefined, onSaveReview: kind ? (payload) => saveReview(kind, cur?.id, payload) : undefined }, material.id));
                    }) }))] }) }));
}
