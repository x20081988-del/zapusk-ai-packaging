import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { FileText, Download } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { formatDate } from '../../lib/format';
export function DocumentCard({ doc, onDownload }) {
    return (_jsx(Card, { children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-md bg-elevated border border-line flex items-center justify-center flex-shrink-0", children: _jsx(FileText, { size: 16, className: "text-secondary" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsxs(StatusBadge, { tone: "zapusk", dot: true, children: ["v", doc.version] }), _jsx("span", { className: "text-[11px] uppercase tracking-[0.08em] text-muted", children: doc.format === 'markdown' ? 'текстовый файл' : 'данные проекта' })] }), _jsx("h3", { className: "text-sm font-semibold text-primary truncate", children: doc.title }), _jsx("p", { className: "text-xs text-muted mt-1", children: formatDate(doc.createdAt) })] }), _jsx(Button, { size: "sm", variant: "ghost", iconLeft: _jsx(Download, { size: 12 }), onClick: onDownload, children: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u044B\u0439 \u0444\u0430\u0439\u043B" })] }) }));
}
