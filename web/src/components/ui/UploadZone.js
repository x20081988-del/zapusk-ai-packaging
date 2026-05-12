import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import clsx from 'clsx';
import { UploadCloud } from 'lucide-react';
export function UploadZone({ onFiles, multiple = true, accept, hint }) {
    const ref = useRef(null);
    const [over, setOver] = useState(false);
    function handle(files) {
        if (!files)
            return;
        onFiles(Array.from(files));
    }
    return (_jsxs("div", { onDragOver: (e) => { e.preventDefault(); setOver(true); }, onDragLeave: () => setOver(false), onDrop: (e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }, onClick: () => ref.current?.click(), className: clsx('relative flex flex-col items-center justify-center gap-2.5 py-10 px-6 border-2 border-dashed rounded-lg cursor-pointer transition-all', over ? 'border-zapusk bg-zapusk/5' : 'border-line bg-canvas hover:border-zapusk/50 hover:bg-surface'), children: [_jsx("div", { className: clsx('w-12 h-12 rounded-full flex items-center justify-center', over ? 'bg-zapusk/20' : 'bg-surface border border-line'), children: _jsx(UploadCloud, { size: 20, className: over ? 'text-zapusk-400' : 'text-secondary' }) }), _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-sm font-medium text-primary", children: "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0444\u0430\u0439\u043B\u044B \u0438\u043B\u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u0434\u043B\u044F \u0432\u044B\u0431\u043E\u0440\u0430" }), _jsx("div", { className: "text-xs text-muted mt-1", children: hint ?? 'PDF, DOCX, XLSX, PPTX, PNG/JPG · до 50 МБ' })] }), _jsx("input", { ref: ref, type: "file", multiple: multiple, accept: accept, className: "hidden", onChange: (e) => handle(e.target.files) })] }));
}
