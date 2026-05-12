import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sparkles, TrendingUp, FolderOpen } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { ProjectCard } from '../components/ui/ProjectCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import { computeProgress } from '../lib/progress';
import { useMode } from '../lib/mode';
import { isLegacyDemoProject } from '../lib/demoMaterials';
export default function Dashboard() {
    const [projects, setProjects] = useState(null);
    const [mode] = useMode();
    useEffect(() => {
        api.get('/api/projects').then((r) => setProjects(r.projects));
    }, []);
    const visibleProjects = projects?.filter((p) => mode === 'team' || !isLegacyDemoProject(p)) ?? null;
    const total = visibleProjects?.length ?? 0;
    const ready = visibleProjects?.filter((p) => p.status === 'ready').length ?? 0;
    const inWork = visibleProjects?.filter((p) => p.status === 'packaging').length ?? 0;
    return (_jsxs(AppLayout, { title: "\u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u0441\u0442\u043E\u043B", action: _jsx(Link, { to: "/projects/new", children: _jsx(Button, { size: "md", iconLeft: _jsx(Plus, { size: 14, strokeWidth: 2.5 }), children: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442" }) }), children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-6", children: [_jsx(StatCard, { label: "\u041F\u0440\u043E\u0435\u043A\u0442\u043E\u0432 \u0432\u0441\u0435\u0433\u043E", value: total, icon: _jsx(FolderOpen, { size: 16 }) }), _jsx(StatCard, { label: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435", value: inWork, icon: _jsx(Sparkles, { size: 16 }), accent: "ai" }), _jsx(StatCard, { label: "\u0413\u043E\u0442\u043E\u0432\u043E \u043A \u043F\u043E\u043A\u0430\u0437\u0443 \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0443", value: ready, icon: _jsx(TrendingUp, { size: 16 }), accent: "zapusk" })] }), _jsx("div", { className: "mb-4 flex items-end justify-between", children: _jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold text-primary tracking-tight", children: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B" }), _jsx("p", { className: "text-xs text-muted", children: "\u041A\u0430\u0436\u0434\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u043F\u0440\u043E\u0445\u043E\u0434\u0438\u0442 \u043F\u0443\u0442\u044C: \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u2192 \u0431\u0438\u0437\u043D\u0435\u0441 \u043D\u0430 \u0441\u0430\u043B\u0444\u0435\u0442\u043A\u0435 \u2192 \u0438\u043D\u0442\u0435\u0440\u0432\u044C\u044E \u043F\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0443 \u2192 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430" })] }) }), projects === null ? (_jsx(Card, { children: _jsx("div", { className: "text-sm text-muted text-center py-8", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }) })) : visibleProjects?.length === 0 ? (_jsx(Card, { children: _jsx(EmptyState, { icon: _jsx(Sparkles, { size: 20 }), title: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432", description: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442, \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B \u2014 \u0438 \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u0441\u043E\u0431\u0435\u0440\u0451\u0442 \u00AB\u0431\u0438\u0437\u043D\u0435\u0441 \u043D\u0430 \u0441\u0430\u043B\u0444\u0435\u0442\u043A\u0435\u00BB \u0437\u0430 \u043C\u0438\u043D\u0443\u0442\u0443.", action: _jsx(Link, { to: "/projects/new", children: _jsx(Button, { iconLeft: _jsx(Plus, { size: 14, strokeWidth: 2.5 }), children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442" }) }) }) })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: visibleProjects?.map((p) => (_jsx(ProjectCard, { project: p, percent: computeProgress(p).percent }, p.id))) }))] }));
}
function StatCard({ label, value, icon, accent, }) {
    return (_jsx(Card, { accent: accent ?? null, children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.12em] text-muted font-semibold", children: label }), _jsx("div", { className: "text-3xl font-bold text-primary mt-2 font-num tracking-tight", children: value })] }), _jsx("div", { className: `w-9 h-9 rounded-md flex items-center justify-center ${accent === 'ai' ? 'bg-ai/15 text-ai-glow border border-ai/30' : accent === 'zapusk' ? 'bg-zapusk/15 text-zapusk-400 border border-zapusk/30' : 'bg-elevated text-secondary border border-line'}`, children: icon })] }) }));
}
