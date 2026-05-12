import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function EmptyState({ icon, title, description, action }) {
    return (_jsxs("div", { className: "flex flex-col items-center justify-center text-center py-16 px-6", children: [icon && (_jsx("div", { className: "w-14 h-14 mb-4 rounded-full bg-surface border border-line flex items-center justify-center text-muted", children: icon })), _jsx("h3", { className: "text-base font-semibold text-primary mb-1.5", children: title }), description && _jsx("p", { className: "text-sm text-secondary max-w-md", children: description }), action && _jsx("div", { className: "mt-5", children: action })] }));
}
