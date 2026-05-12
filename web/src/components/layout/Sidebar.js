import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, FolderPlus, FileCode2, ShieldCheck, BookOpen, Rocket, BookText, Headphones, Radio } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { ModeToggle } from '../ui/ModeToggle';
import { useMode } from '../../lib/mode';
const NAV = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Рабочий стол' },
    { to: '/projects/new', icon: FolderPlus, label: 'Новый проект' },
    { to: '/guide', icon: BookText, label: 'Гайд команды' },
    { to: '/ai-leads', icon: Radio, label: 'Получать AI-лиды' },
    { to: '/sales-assistant', icon: Headphones, label: 'AI-ассистент на продажах' },
    // team-only navigation lives below — hidden from clients
    { to: '/templates', icon: FileCode2, label: 'Шаблоны заданий', teamOnly: true },
    { to: '/admin/projects', icon: ShieldCheck, label: 'Админ', teamOnly: true },
];
export function Sidebar() {
    const [mode] = useMode();
    const visibleNav = NAV.filter((n) => !n.teamOnly || mode === 'team');
    return (_jsxs("aside", { className: "hidden lg:flex flex-col w-sidebar bg-ink border-r border-line shrink-0 h-screen sticky top-0", children: [_jsx("div", { className: "px-5 py-5 border-b border-hairline", children: _jsx(Logo, {}) }), _jsxs("nav", { className: "flex-1 px-3 py-5 space-y-1", children: [_jsx(SectionLabel, { children: "\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F" }), visibleNav.map(({ to, icon: Icon, label }) => (_jsxs(NavLink, { to: to, className: ({ isActive }) => clsx('flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-all', isActive
                            ? 'bg-zapusk/10 text-primary border border-zapusk/30 shadow-glow'
                            : 'text-secondary hover:text-primary hover:bg-surface'), children: [_jsx(Icon, { size: 16, className: "shrink-0" }), label] }, to))), _jsxs("div", { className: "pt-6", children: [_jsx(SectionLabel, { children: "\u0420\u0435\u0441\u0443\u0440\u0441\u044B" }), _jsxs("a", { href: "https://zapusk.tech", target: "_blank", rel: "noreferrer", className: "flex items-center gap-3 px-3 h-10 rounded-md text-sm text-secondary hover:text-primary hover:bg-surface transition-all", children: [_jsx(BookOpen, { size: 16, className: "shrink-0" }), "\u0411\u0430\u0437\u0430 \u0437\u043D\u0430\u043D\u0438\u0439"] })] })] }), _jsxs("div", { className: "mx-3 mb-3", children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.14em] text-faint font-semibold mb-1.5 px-1", children: "\u0420\u0435\u0436\u0438\u043C \u0438\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430" }), _jsx(ModeToggle, {})] }), _jsxs("div", { className: "mx-3 mb-4 p-4 rounded-lg border border-line bg-grad-ink relative overflow-hidden", children: [_jsx("div", { className: "absolute -top-8 -right-8 w-24 h-24 bg-zapusk/20 rounded-full blur-2xl" }), _jsx(Rocket, { size: 16, className: "text-zapusk-400 mb-2" }), _jsx("div", { className: "text-[13px] font-semibold text-primary leading-tight", children: "ZAPUSK AI" }), _jsx("div", { className: "text-[11px] text-muted mt-1 leading-snug", children: "\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432 \u043A \u0438\u043D\u0432\u0435\u0441\u0442\u043E\u0440\u0430\u043C." })] })] }));
}
function SectionLabel({ children }) {
    return (_jsx("div", { className: "px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint", children: children }));
}
