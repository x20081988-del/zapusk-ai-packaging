import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DocumentCard } from '../components/ui/DocumentCard';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
export default function ProjectDocuments() {
    const { id } = useParams();
    const [project, setProject] = useState(null);
    useEffect(() => {
        if (!id)
            return;
        api.get(`/api/projects/${id}`).then((r) => setProject(r.project));
    }, [id]);
    return (_jsx(AppLayout, { title: project ? `${project.name} · Документы` : 'Документы', action: _jsx(Link, { to: `/projects/${id}`, children: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(ArrowLeft, { size: 14 }), children: "\u041A \u043F\u0440\u043E\u0435\u043A\u0442\u0443" }) }), children: _jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u0422\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B", subtitle: "\u0422\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0434\u043B\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u00B7 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0432\u0435\u0440\u0441\u0438\u0439" }), !project?.generatedDocs || project.generatedDocs.length === 0 ? (_jsx(EmptyState, { icon: _jsx(FileText, { size: 20 }), title: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442", description: "\u0411\u0438\u0437\u043D\u0435\u0441 \u043D\u0430 \u0441\u0430\u043B\u0444\u0435\u0442\u043A\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u043A\u0430\u043A \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0432\u043E\u0439 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0431\u0440\u0438\u0444\u0430. \u041E\u0434\u043D\u043E\u0441\u0442\u0440\u0430\u043D\u0438\u0447\u043D\u0438\u043A, \u043E\u0442\u0432\u0435\u0442\u044B \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441\u044B \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430 \u0438 \u043A\u0440\u0430\u0442\u043A\u043E\u0435 \u0440\u0435\u0437\u044E\u043C\u0435 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0445 \u0437\u0430\u0434\u0430\u043D\u0438\u0439." })) : (_jsx("ul", { className: "space-y-3", children: project.generatedDocs.map((d) => (_jsx(DocumentCard, { doc: d, onDownload: () => window.open(`/api/projects/${id}/documents/${d.id}.md`) }, d.id))) }))] }) }));
}
