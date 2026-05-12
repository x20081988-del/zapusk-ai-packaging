import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { forwardRef } from 'react';
export const Input = forwardRef(function Input({ label, hint, error, required, className, id, ...rest }, ref) {
    const inputId = id ?? rest.name;
    return (_jsx(Field, { label: label, hint: hint, error: error, required: required, htmlFor: inputId, children: _jsx("input", { ref: ref, id: inputId, className: clsx('w-full h-10 px-3.5 bg-canvas border border-line rounded-md text-sm text-primary placeholder:text-faint', 'transition-colors focus:outline-none focus:border-zapusk/60 focus:bg-ink', error && 'border-danger/60', className), ...rest }) }));
});
export const Textarea = forwardRef(function Textarea({ label, hint, error, required, className, id, rows = 4, ...rest }, ref) {
    const inputId = id ?? rest.name;
    return (_jsx(Field, { label: label, hint: hint, error: error, required: required, htmlFor: inputId, children: _jsx("textarea", { ref: ref, id: inputId, rows: rows, className: clsx('w-full px-3.5 py-2.5 bg-canvas border border-line rounded-md text-sm text-primary placeholder:text-faint resize-y', 'transition-colors focus:outline-none focus:border-zapusk/60 focus:bg-ink', error && 'border-danger/60', className), ...rest }) }));
});
export const Select = forwardRef(function Select({ label, hint, error, required, className, options, id, ...rest }, ref) {
    const inputId = id ?? rest.name;
    return (_jsx(Field, { label: label, hint: hint, error: error, required: required, htmlFor: inputId, children: _jsx("select", { ref: ref, id: inputId, className: clsx('w-full h-10 px-3 bg-canvas border border-line rounded-md text-sm text-primary', 'transition-colors focus:outline-none focus:border-zapusk/60 focus:bg-ink', error && 'border-danger/60', className), ...rest, children: options.map((o) => (_jsx("option", { value: o.value, className: "bg-canvas text-primary", children: o.label }, o.value))) }) }));
});
function Field({ label, hint, error, required, htmlFor, children, }) {
    return (_jsxs("label", { htmlFor: htmlFor, className: "block", children: [label && (_jsxs("span", { className: "block text-xs font-medium text-secondary mb-1.5", children: [label, required && _jsx("span", { className: "text-zapusk ml-1", children: "*" })] })), children, error ? (_jsx("span", { className: "block text-xs text-danger mt-1.5", children: error })) : hint ? (_jsx("span", { className: "block text-xs text-muted mt-1.5", children: hint })) : null] }));
}
