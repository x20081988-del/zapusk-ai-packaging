import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { forwardRef } from 'react';
const VARIANTS = {
    primary: 'bg-grad-zapusk text-canvas font-semibold shadow-glow hover:brightness-110 active:brightness-95',
    secondary: 'bg-surface text-primary border border-line hover:border-zapusk/50 hover:bg-elevated',
    ghost: 'bg-transparent text-secondary hover:text-primary hover:bg-surface',
    ai: 'bg-grad-ai text-canvas font-semibold shadow-ai-glow hover:brightness-110',
    danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
};
const SIZES = {
    sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
    md: 'h-10 px-4 text-sm rounded-md gap-2',
    lg: 'h-12 px-6 text-[15px] rounded-lg gap-2.5',
};
export const Button = forwardRef(function Button({ variant = 'primary', size = 'md', iconLeft, iconRight, loading, className, children, disabled, ...rest }, ref) {
    return (_jsxs("button", { ref: ref, disabled: disabled || loading, className: clsx('inline-flex items-center justify-center font-medium transition-all duration-150 ease-smooth select-none', 'disabled:opacity-50 disabled:cursor-not-allowed', VARIANTS[variant], SIZES[size], className), ...rest, children: [loading ? _jsx(Spinner, {}) : iconLeft, children, !loading && iconRight] }));
});
function Spinner() {
    return (_jsx("span", { className: "inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" }));
}
