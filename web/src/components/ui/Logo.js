import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
// ZAPUSK wordmark. The mark is rendered as a CSS mask of the
// SVG so it inherits `text-primary` automatically — black on light, white on
// dark, without swapping assets or touching the file at runtime.
export function Logo({ className, compact }) {
    return (_jsxs("div", { className: clsx('flex items-center gap-2.5', className), children: [_jsx("div", { className: clsx('logo-mark text-primary shrink-0', compact ? 'w-7 h-7' : 'w-9 h-9'), "aria-hidden": true }), !compact && (_jsx("div", { className: "leading-tight", children: _jsxs("div", { className: "text-[14px] font-bold tracking-tight text-primary", children: ["\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 ", _jsx("span", { className: "font-extrabold", children: "ZAPUSK AI" })] }) })), _jsx("span", { className: "sr-only", children: "\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 ZAPUSK AI" })] }));
}
