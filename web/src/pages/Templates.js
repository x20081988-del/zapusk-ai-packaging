import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { FileCode2, Plus, Trash2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TemplateCard } from '../components/ui/TemplateCard';
import { Modal } from '../components/ui/Modal';
import { Textarea, Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
const EMPTY_TEMPLATE = {
    key: '',
    name: '',
    category: 'custom',
    description: '',
    body: '',
    active: true,
};
export default function Templates() {
    const [templates, setTemplates] = useState(null);
    const [current, setCurrent] = useState(null);
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    async function load() {
        const r = await api.get('/api/templates');
        setTemplates(r.templates);
    }
    useEffect(() => { load(); }, []);
    function open(t) {
        setCurrent(t);
        setDraft({ ...t });
        setError(null);
    }
    function createNew() {
        setCurrent(null);
        setDraft({ ...EMPTY_TEMPLATE });
        setError(null);
    }
    function close() {
        setCurrent(null);
        setDraft(null);
        setError(null);
    }
    function validate(d) {
        if (!d.name.trim())
            return 'Название обязательно.';
        if (!d.category.trim())
            return 'Категория обязательна.';
        if (!d.body.trim())
            return 'Текст задания обязателен.';
        if (!current && !/^[a-z0-9_-]+$/.test(d.key.trim()))
            return 'Ключ: только lowercase, цифры, _ или -.';
        return null;
    }
    async function save() {
        if (!draft)
            return;
        const validationError = validate(draft);
        if (validationError) {
            setError(validationError);
            return;
        }
        setSaving(true);
        try {
            const payload = {
                key: draft.key.trim(),
                name: draft.name,
                category: draft.category,
                description: draft.description ?? '',
                body: draft.body,
                active: draft.active,
            };
            if (current) {
                await api.patch(`/api/templates/${current.id}`, payload);
            }
            else {
                await api.post('/api/templates', payload);
            }
            await load();
            close();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось сохранить шаблон.');
        }
        finally {
            setSaving(false);
        }
    }
    async function removeCurrent() {
        if (!current)
            return;
        if (!window.confirm(`Удалить шаблон «${current.name}»?`))
            return;
        setSaving(true);
        try {
            await api.delete(`/api/templates/${current.id}`);
            await load();
            close();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось удалить шаблон.');
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs(AppLayout, { title: "\u0428\u0430\u0431\u043B\u043E\u043D\u044B \u0437\u0430\u0434\u0430\u043D\u0438\u0439", children: [_jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u0411\u0438\u0431\u043B\u0438\u043E\u0442\u0435\u043A\u0430 \u0448\u0430\u0431\u043B\u043E\u043D\u043E\u0432 \u0437\u0430\u0434\u0430\u043D\u0438\u0439", subtitle: "\u0411\u0430\u0437\u043E\u0432\u044B\u0435 \u0448\u0430\u0431\u043B\u043E\u043D\u044B \u0434\u043B\u044F \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u043E\u0432 \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430 \u00B7 \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0435 \u0432 \u0444\u0438\u0433\u0443\u0440\u043D\u044B\u0445 \u0441\u043A\u043E\u0431\u043A\u0430\u0445 \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u044E\u0442\u0441\u044F \u0434\u0430\u043D\u043D\u044B\u043C\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430", action: _jsx(Button, { size: "sm", iconLeft: _jsx(Plus, { size: 14 }), onClick: createNew, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C" }) }), !templates ? (_jsx("p", { className: "text-sm text-muted text-center py-8", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" })) : templates.length === 0 ? (_jsx(EmptyState, { icon: _jsx(FileCode2, { size: 20 }), title: "\u0428\u0430\u0431\u043B\u043E\u043D\u043E\u0432 \u043D\u0435\u0442", description: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0431\u0430\u0437\u043E\u0432\u044B\u0439 \u043D\u0430\u0431\u043E\u0440 \u0448\u0430\u0431\u043B\u043E\u043D\u043E\u0432 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u044B\u0439 \u0448\u0430\u0431\u043B\u043E\u043D \u0432\u0440\u0443\u0447\u043D\u0443\u044E.", action: _jsx(Button, { iconLeft: _jsx(Plus, { size: 14 }), onClick: createNew, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" }) })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: templates.map((t) => _jsx(TemplateCard, { template: t, onOpen: () => open(t) }, t.id)) }))] }), _jsx(Modal, { open: Boolean(draft), onClose: close, title: current?.name ?? 'Новый шаблон', width: "max-w-4xl", children: draft && (_jsxs("div", { className: "p-5 space-y-4", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx(Input, { label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", value: draft.name, onChange: (e) => setDraft({ ...draft, name: e.target.value }) }), _jsx(Input, { label: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F", value: draft.category, onChange: (e) => setDraft({ ...draft, category: e.target.value }) })] }), _jsx(Input, { label: "\u041A\u043B\u044E\u0447", hint: current ? 'Ключ нельзя менять после создания.' : 'Например: investor_update или partner_email', value: draft.key, disabled: Boolean(current), onChange: (e) => setDraft({ ...draft, key: e.target.value }) }), _jsx(Input, { label: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", value: draft.description ?? '', onChange: (e) => setDraft({ ...draft, description: e.target.value }) }), _jsx(Textarea, { label: "\u0422\u0435\u043A\u0441\u0442 \u0437\u0430\u0434\u0430\u043D\u0438\u044F", hint: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 {{project_name}}, {{raise_amount}}, {{equity}}, {{business_summary}}, {{strengths}}, {{weaknesses}}, {{missing_data}}, {{napkin}} \u0438 \u0442.\u043F.", rows: 18, value: draft.body, onChange: (e) => setDraft({ ...draft, body: e.target.value }), className: "font-mono text-xs" }), error && _jsx("p", { className: "text-xs text-danger", children: error }), _jsxs("div", { className: "flex items-center justify-between gap-2 pt-2", children: [_jsx("div", { children: current && (_jsx(Button, { variant: "ghost", iconLeft: _jsx(Trash2, { size: 14 }), onClick: removeCurrent, loading: saving, children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" })) }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx(Button, { variant: "ghost", onClick: close, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { onClick: save, loading: saving, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" })] })] })] })) })] }));
}
