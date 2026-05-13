import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { getAuth, clearAuth, roleLabel } from '../../lib/auth';
import { ThemeToggle } from '../ui/ThemeToggle';
import { StatusBadge } from '../ui/StatusBadge';
export function Topbar({ title, action }) {
    const auth = getAuth();
    const navigate = useNavigate();
    return (_jsx("header", { className: "h-16 bg-ink/70 backdrop-blur border-b border-hairline sticky top-0 z-30", children: _jsxs("div", { className: "h-full px-6 lg:px-8 flex items-center justify-between gap-4", children: [_jsx("h1", { className: "text-base font-semibold text-primary tracking-tight truncate", children: title }), _jsxs("div", { className: "flex items-center gap-3", children: [action, _jsx(ThemeToggle, {}), auth && (_jsx(StatusBadge, { tone: auth.role === 'admin' ? 'danger' : auth.role === 'manager' ? 'ai' : 'success', dot: true, children: roleLabel(auth.role) })), _jsxs("div", { className: "hidden md:flex items-center gap-2.5 pl-4 border-l border-hairline", children: [_jsx("div", { className: "w-7 h-7 rounded-full bg-grad-zapusk flex items-center justify-center text-white text-xs font-bold", children: (auth?.name ?? auth?.email ?? '?').charAt(0).toUpperCase() }), _jsxs("div", { className: "hidden lg:block", children: [_jsx("div", { className: "text-[12px] font-medium text-primary leading-tight", children: auth?.name ?? '—' }), _jsx("div", { className: "text-[10px] text-muted", children: auth?.email ?? '' })] }), _jsx("button", { onClick: () => {
                                        clearAuth();
                                        navigate('/login');
                                    }, className: "ml-2 text-muted hover:text-danger transition-colors", title: "\u0412\u044B\u0439\u0442\u0438", children: _jsx(LogOut, { size: 15 }) })] })] })] }) }));
}
