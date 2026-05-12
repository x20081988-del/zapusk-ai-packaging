import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { getAuth } from '../../lib/auth';
export function AppLayout({ title, action, children }) {
    const auth = getAuth();
    if (!auth)
        return _jsx(Navigate, { to: "/login", replace: true });
    return (_jsxs("div", { className: "min-h-screen flex bg-canvas", children: [_jsx(Sidebar, {}), _jsxs("div", { className: "flex-1 min-w-0 flex flex-col", children: [_jsx(Topbar, { title: title, action: action }), _jsx("main", { className: "flex-1 px-6 lg:px-8 py-6 lg:py-8", children: _jsx("div", { className: "max-w-content mx-auto animate-rise", children: children }) })] })] }));
}
