import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Link2, FileText } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { UploadZone } from '../components/ui/UploadZone';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { api } from '../lib/api';
const CATEGORIES = [
    { value: 'pitch', label: 'Презентация' },
    { value: 'financial', label: 'Финансовая модель' },
    { value: 'description', label: 'Описание проекта' },
    { value: 'image', label: 'Изображение' },
    { value: 'logo', label: 'Логотип' },
    { value: 'reference', label: 'Референс' },
    { value: 'other', label: 'Прочее' },
];
export default function ProjectUpload() {
    const { id } = useParams();
    const [project, setProject] = useState(null);
    const [category, setCategory] = useState('pitch');
    const [linkUrl, setLinkUrl] = useState('');
    const [linkNote, setLinkNote] = useState('');
    async function load() {
        if (!id)
            return;
        const r = await api.get(`/api/projects/${id}`);
        setProject(r.project);
    }
    useEffect(() => { load(); }, [id]);
    async function uploadFiles(files) {
        if (!id)
            return;
        const form = new FormData();
        form.append('category', category);
        files.forEach((f) => form.append('files', f));
        await api.upload(`/api/files/${id}/upload`, form);
        load();
    }
    async function addLink() {
        if (!id || !linkUrl)
            return;
        await api.post(`/api/files/${id}/link`, { url: linkUrl, note: linkNote, category: 'reference' });
        setLinkUrl('');
        setLinkNote('');
        load();
    }
    async function remove(fid) {
        if (!id)
            return;
        await api.delete(`/api/files/${id}/${fid}`);
        load();
    }
    return (_jsxs(AppLayout, { title: project ? `${project.name} · Материалы` : 'Материалы', action: _jsx(Link, { to: `/projects/${id}`, children: _jsx(Button, { variant: "ghost", size: "sm", iconLeft: _jsx(ArrowLeft, { size: 14 }), children: "\u041A \u043F\u0440\u043E\u0435\u043A\u0442\u0443" }) }), children: [_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B", subtitle: "\u041F\u0440\u0435\u0437\u0435\u043D\u0442\u0430\u0446\u0438\u0438, \u0444\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438, \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u044F, \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F" }), _jsx(Select, { label: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F", value: category, onChange: (e) => setCategory(e.target.value), options: CATEGORIES }), _jsx("div", { className: "mt-4", children: _jsx(UploadZone, { onFiles: uploadFiles, hint: "PDF \u00B7 DOCX \u00B7 XLSX \u00B7 PPTX \u00B7 PNG \u00B7 JPG" }) })] }), _jsxs(Card, { padded: true, children: [_jsx(CardHeader, { title: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u0438", subtitle: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B, \u0442\u0430\u0431\u043B\u0438\u0446\u044B, \u0441\u0430\u0439\u0442 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438 \u0438 \u0434\u0440\u0443\u0433\u0438\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438" }), _jsx(Input, { label: "URL", value: linkUrl, onChange: (e) => setLinkUrl(e.target.value), placeholder: "https://" }), _jsx("div", { className: "mt-3", children: _jsx(Input, { label: "\u041F\u043E\u0434\u043F\u0438\u0441\u044C", value: linkNote, onChange: (e) => setLinkNote(e.target.value), placeholder: "\u0424\u0438\u043D\u0430\u043D\u0441\u043E\u0432\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C" }) }), _jsx("div", { className: "mt-4 flex justify-end", children: _jsx(Button, { onClick: addLink, disabled: !linkUrl, iconLeft: _jsx(Link2, { size: 14 }), children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" }) })] })] }), _jsxs(Card, { padded: true, className: "mt-6", children: [_jsx(CardHeader, { title: "\u0412\u0441\u0435 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044B", subtitle: `${project?.files?.length ?? 0} элементов` }), !project?.files || project.files.length === 0 ? (_jsx("p", { className: "text-sm text-muted text-center py-6", children: "\u041F\u043E\u043A\u0430 \u043F\u0443\u0441\u0442\u043E" })) : (_jsx("ul", { className: "space-y-2", children: project.files.map((f) => _jsx(Row, { file: f, onRemove: () => remove(f.id) }, f.id)) }))] })] }));
}
function Row({ file, onRemove }) {
    const isLink = Boolean(file.url);
    return (_jsxs("li", { className: "flex items-center gap-3 px-3 py-2.5 rounded-md bg-canvas/50 border border-hairline group", children: [_jsx("div", { className: "w-8 h-8 rounded-md bg-surface border border-line flex items-center justify-center flex-shrink-0", children: isLink ? _jsx(Link2, { size: 13, className: "text-secondary" }) : _jsx(FileText, { size: 13, className: "text-secondary" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-sm font-medium text-primary truncate", children: file.originalName }), _jsx("div", { className: "text-xs text-muted", children: isLink ? file.url : `${Math.round(file.size / 1024)} КБ · ${file.category}` })] }), _jsx("button", { onClick: onRemove, className: "text-muted hover:text-danger transition-colors", children: _jsx(Trash2, { size: 14 }) })] }));
}
