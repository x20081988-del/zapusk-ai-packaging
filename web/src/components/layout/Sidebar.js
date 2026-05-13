import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, FolderPlus, FileCode2, ShieldCheck, BookOpen, Headphones, Radio, BriefcaseBusiness, Users, Settings, UserRound, Presentation, ClipboardList, CalendarDays, MessageCircle, Handshake, KanbanSquare, PackageCheck, ClipboardCheck, Brain, } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { getAuth, roleLabel } from '../../lib/auth';
const NAV = {
    client: [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Рабочий стол' },
        { to: '/projects/new', icon: FolderPlus, label: 'Новый проект' },
        { to: '/demo', icon: Presentation, label: 'Демо-кабинет' },
        { to: '/ai-leads', icon: Radio, label: 'AI-лиды' },
        { to: '/sales-assistant', icon: Headphones, label: 'AI-ассистент' },
        { to: '/conversation-analysis', icon: Brain, label: 'AI-разбор переговоров' },
        { to: '/meetings', icon: ClipboardCheck, label: 'Встречи' },
        { to: '/personal-manager', icon: MessageCircle, label: 'Персональный менеджер' },
    ],
    manager: [
        { to: '/manager', icon: LayoutDashboard, label: 'Рабочий стол менеджера' },
        { to: '/manager/projects', icon: BriefcaseBusiness, label: 'Мои проекты' },
        { to: '/manager/leads', icon: Radio, label: 'Новые лиды' },
        { to: '/conversation-analysis', icon: Brain, label: 'AI-разбор переговоров' },
        { to: '/meetings', icon: ClipboardCheck, label: 'Встречи' },
        { to: '/manager/meetings', icon: CalendarDays, label: 'Календарь' },
        { to: '/manager/tasks', icon: ClipboardList, label: 'Задачи' },
        { to: '/manager/clients', icon: Users, label: 'Клиенты' },
    ],
    admin: [
        { to: '/admin', icon: ShieldCheck, label: 'Админ-панель' },
        { to: '/admin/projects', icon: BriefcaseBusiness, label: 'Все проекты' },
        { to: '/admin/users', icon: Users, label: 'Пользователи' },
        { to: '/templates', icon: FileCode2, label: 'Шаблоны' },
        { to: '/admin/leads', icon: Radio, label: 'Лиды' },
        { to: '/conversation-analysis', icon: Brain, label: 'AI-разбор переговоров' },
        { to: '/meetings', icon: ClipboardCheck, label: 'Встречи' },
        { to: '/admin/materials', icon: PackageCheck, label: 'Материалы' },
        { to: '/admin/settings', icon: Settings, label: 'Настройки' },
    ],
};
export function Sidebar() {
    const role = getAuth()?.role ?? 'client';
    const visibleNav = NAV[role];
    return (_jsxs("aside", { className: "hidden lg:flex flex-col w-sidebar bg-ink border-r border-line shrink-0 h-screen sticky top-0", children: [_jsx("div", { className: "px-5 py-5 border-b border-hairline", children: _jsx(Logo, {}) }), _jsxs("nav", { className: "flex-1 px-3 py-5 space-y-1", children: [_jsx(SectionLabel, { children: roleLabel(role) }), visibleNav.map(({ to, icon: Icon, label }) => (_jsxs(NavLink, { to: to, className: ({ isActive }) => clsx('flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-all', isActive
                            ? 'bg-zapusk/10 text-primary border border-zapusk/30 shadow-glow'
                            : 'text-secondary hover:text-primary hover:bg-surface'), children: [_jsx(Icon, { size: 16, className: "shrink-0" }), label] }, to))), _jsxs("div", { className: "pt-6", children: [_jsx(SectionLabel, { children: "\u0420\u0435\u0441\u0443\u0440\u0441\u044B" }), _jsxs("a", { href: "https://zapusk.tech", target: "_blank", rel: "noreferrer", className: "flex items-center gap-3 px-3 h-10 rounded-md text-sm text-secondary hover:text-primary hover:bg-surface transition-all", children: [_jsx(BookOpen, { size: 16, className: "shrink-0" }), "\u0411\u0430\u0437\u0430 \u0437\u043D\u0430\u043D\u0438\u0439"] })] })] }), _jsxs("div", { className: "mx-3 mb-4 p-4 rounded-lg border border-line bg-grad-ink relative overflow-hidden", children: [_jsx("div", { className: "absolute -top-8 -right-8 w-24 h-24 bg-zapusk/20 rounded-full blur-2xl" }), role === 'client' ? _jsx(UserRound, { size: 16, className: "text-zapusk-400 mb-2" }) : role === 'manager' ? _jsx(Handshake, { size: 16, className: "text-zapusk-400 mb-2" }) : _jsx(KanbanSquare, { size: 16, className: "text-zapusk-400 mb-2" }), _jsx("div", { className: "text-[13px] font-semibold text-primary leading-tight", children: role === 'client' ? 'Ваш менеджер' : role === 'manager' ? 'Команда сопровождения' : 'ZAPUSK AI Admin' }), _jsx("div", { className: "text-[11px] text-muted mt-1 leading-snug", children: role === 'client' ? 'Екатерина · упаковка и лиды' : role === 'manager' ? 'Фокус на проектах и следующих шагах.' : 'Роли, проекты, шаблоны и статусы.' })] })] }));
}
function SectionLabel({ children }) {
    return (_jsx("div", { className: "px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint", children: children }));
}
