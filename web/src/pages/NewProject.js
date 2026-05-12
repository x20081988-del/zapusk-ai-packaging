import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Rocket } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input, Select, Textarea } from '../components/ui/Input';
import { VoiceInputButton } from '../components/ui/VoiceInputButton';
import { api } from '../lib/api';
const STAGE_OPTIONS = [
    { value: '', label: '— выберите —' },
    { value: 'idea', label: 'Идея' },
    { value: 'mvp', label: 'MVP' },
    { value: 'early_revenue', label: 'Ранняя выручка' },
    { value: 'scaling', label: 'Масштабирование' },
    { value: 'growth', label: 'Рост' },
];
const INVESTOR_OPTIONS = [
    { value: '', label: '— выберите —' },
    { value: 'private', label: 'Частный инвестор' },
    { value: 'fund', label: 'Фонд' },
    { value: 'strategic', label: 'Стратег' },
    { value: 'grant', label: 'Грант' },
];
const LEGAL_OPTIONS = [
    { value: '', label: '— выберите —' },
    { value: 'OOO', label: 'ООО' },
    { value: 'IP', label: 'ИП' },
    { value: 'AO', label: 'АО / ПАО' },
    { value: 'individual', label: 'Физлицо' },
    { value: 'other', label: 'Иное' },
];
export default function NewProject() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        name: '',
        inn: '',
        website: '',
        industry: '',
        legalStatus: '',
        stage: '',
        raiseAmount: '',
        minCheck: '',
        equityOffered: '',
        raiseDeadline: '',
        investorType: '',
        description: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState(null);
    function set(k, v) {
        setForm((f) => ({ ...f, [k]: v }));
    }
    function appendDescription(text) {
        setForm((f) => ({
            ...f,
            description: [f.description.trim(), text.trim()].filter(Boolean).join('\n'),
        }));
    }
    async function submit(e) {
        e.preventDefault();
        if (!form.name.trim())
            return setErr('Название обязательно');
        setSubmitting(true);
        setErr(null);
        try {
            const res = await api.post('/api/projects', {
                name: form.name.trim(),
                inn: form.inn || null,
                website: form.website || null,
                industry: form.industry || null,
                legalStatus: form.legalStatus || null,
                stage: form.stage || null,
                raiseAmount: form.raiseAmount ? Number(form.raiseAmount) : null,
                minCheck: form.minCheck ? Number(form.minCheck) : null,
                equityOffered: form.equityOffered ? Number(form.equityOffered) : null,
                raiseDeadline: form.raiseDeadline || null,
                investorType: form.investorType || null,
                description: form.description.trim() || null,
            });
            navigate(`/projects/${res.project.id}`);
        }
        catch (e) {
            setErr(e instanceof Error ? e.message : 'create failed');
            setSubmitting(false);
        }
    }
    return (_jsx(AppLayout, { title: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442", action: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(ArrowLeft, { size: 14 }), onClick: () => navigate(-1), children: "\u041D\u0430\u0437\u0430\u0434" }), children: _jsxs("div", { className: "max-w-readable mx-auto", children: [_jsxs("div", { className: "mb-6", children: [_jsxs("div", { className: "inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold mb-2", children: [_jsx(Rocket, { size: 12 }), " \u0428\u0430\u0433 1 \u0438\u0437 3"] }), _jsx("h1", { className: "text-2xl font-bold text-primary tracking-tight", children: "\u0421\u0442\u0430\u0440\u0442 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0438 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432" }), _jsx("p", { className: "text-sm text-secondary mt-1.5", children: "\u042D\u0442\u0438 \u0434\u0430\u043D\u043D\u044B\u0435 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u0443\u044E\u0442 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u0427\u0435\u043C \u0442\u043E\u0447\u043D\u0435\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u2014 \u0442\u0435\u043C \u0433\u043B\u0443\u0431\u0436\u0435 \u0431\u0443\u0434\u0435\u0442 \u043F\u0435\u0440\u0432\u0438\u0447\u043D\u044B\u0439 \u0440\u0430\u0437\u0431\u043E\u0440." })] }), _jsxs("form", { onSubmit: submit, className: "space-y-4", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "\u0418\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u044F", subtitle: "\u0427\u0442\u043E \u0438 \u043A\u0442\u043E" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx(Input, { label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", required: true, value: form.name, onChange: (e) => set('name', e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: Tinkoff Investments AI" }), _jsx(Input, { label: "\u0418\u041D\u041D", hint: "\u041C\u043E\u0436\u043D\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u043C, \u0435\u0441\u043B\u0438 \u044E\u0440\u043B\u0438\u0446\u043E \u0435\u0449\u0435 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u043E", value: form.inn, onChange: (e) => set('inn', e.target.value), placeholder: "10 \u0438\u043B\u0438 12 \u0446\u0438\u0444\u0440" }), _jsx(Input, { label: "\u0421\u0430\u0439\u0442", type: "url", value: form.website, onChange: (e) => set('website', e.target.value), placeholder: "https://" }), _jsx(Input, { label: "\u041E\u0442\u0440\u0430\u0441\u043B\u044C", value: form.industry, onChange: (e) => set('industry', e.target.value), placeholder: "\u0424\u0438\u043D\u0442\u0435\u0445 / \u0441\u0435\u0440\u0432\u0438\u0441 \u0434\u043B\u044F \u0431\u0438\u0437\u043D\u0435\u0441\u0430 / \u043C\u0430\u0440\u043A\u0435\u0442\u043F\u043B\u0435\u0439\u0441 / \u2026" }), _jsx(Select, { label: "\u042E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0441\u0442\u0430\u0442\u0443\u0441", value: form.legalStatus, onChange: (e) => set('legalStatus', e.target.value), options: LEGAL_OPTIONS }), _jsx(Select, { label: "\u0421\u0442\u0430\u0434\u0438\u044F", value: form.stage, onChange: (e) => set('stage', e.target.value), options: STAGE_OPTIONS })] })] }), _jsxs(Card, { accent: "zapusk", children: [_jsx(CardHeader, { title: "\u0421\u0434\u0435\u043B\u043A\u0430", subtitle: "\u0423\u0441\u043B\u043E\u0432\u0438\u044F \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx(Input, { label: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0445\u043E\u0442\u0438\u0442\u0435 \u043F\u0440\u0438\u0432\u043B\u0435\u0447\u044C, \u20BD", type: "number", inputMode: "numeric", value: form.raiseAmount, onChange: (e) => set('raiseAmount', e.target.value), placeholder: "20 000 000" }), _jsx(Input, { label: "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u0447\u0435\u043A \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430, \u20BD", type: "number", inputMode: "numeric", value: form.minCheck, onChange: (e) => set('minCheck', e.target.value), placeholder: "1 000 000" }), _jsx(Input, { label: "\u0414\u043E\u043B\u044F \u0434\u043B\u044F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430, %", type: "number", inputMode: "decimal", value: form.equityOffered, onChange: (e) => set('equityOffered', e.target.value), placeholder: "10" }), _jsx(Input, { label: "\u0421\u0440\u043E\u043A \u043F\u0440\u0438\u0432\u043B\u0435\u0447\u0435\u043D\u0438\u044F", type: "date", value: form.raiseDeadline, onChange: (e) => set('raiseDeadline', e.target.value) }), _jsx(Select, { label: "\u0422\u0438\u043F \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430", value: form.investorType, onChange: (e) => set('investorType', e.target.value), options: INVESTOR_OPTIONS })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", subtitle: "\u041E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E \u2014 \u043F\u043E\u043C\u043E\u0436\u0435\u0442 \u043F\u0435\u0440\u0432\u043E\u043C\u0443 \u0440\u0430\u0437\u0431\u043E\u0440\u0443" }), _jsx("div", { className: "mb-3 flex justify-end", children: _jsx(VoiceInputButton, { label: "\u041D\u0430\u0434\u0438\u043A\u0442\u043E\u0432\u0430\u0442\u044C \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442", onTranscript: appendDescription }) }), _jsx(Textarea, { value: form.description, onChange: (e) => set('description', e.target.value), rows: 4, placeholder: "\u0412 \u0434\u0432\u0443\u0445 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F\u0445: \u0447\u0442\u043E \u0434\u0435\u043B\u0430\u0435\u0442\u0435, \u043A\u043E\u043C\u0443 \u043F\u0440\u043E\u0434\u0430\u0451\u0442\u0435, \u043A\u0430\u043A \u0437\u0430\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442\u0435." })] }), err && _jsx("div", { className: "text-sm text-danger", children: err }), _jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [_jsx(Button, { type: "button", variant: "ghost", onClick: () => navigate('/dashboard'), children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { type: "submit", loading: submitting, size: "lg", iconLeft: _jsx(Rocket, { size: 14 }), children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0438 \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432" })] })] })] }) }));
}
