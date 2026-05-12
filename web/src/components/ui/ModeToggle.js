import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { Users, ShieldCheck } from 'lucide-react';
import { useMode } from '../../lib/mode';
// Two-state toggle for the UI mode (client vs Zapusk team). Lives in Sidebar.
// Switching client → team unlocks Admin / Templates / Sales Assistant from the nav.
export function ModeToggle({ compact }) {
    const [mode, setMode] = useMode();
    function pick(next) {
        if (next === mode)
            return;
        setMode(next);
    }
    return (_jsxs("div", { className: clsx('rounded-md border border-line bg-canvas/40 p-1 flex gap-1', compact && 'p-0.5'), children: [_jsx(ModeButton, { active: mode === 'client', onClick: () => pick('client'), icon: _jsx(Users, { size: 11 }), label: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx(ModeButton, { active: mode === 'team', onClick: () => pick('team'), icon: _jsx(ShieldCheck, { size: 11 }), label: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430" })] }));
}
function ModeButton({ active, onClick, icon, label }) {
    return (_jsxs("button", { type: "button", onClick: onClick, className: clsx('flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-[6px] text-[11px] font-medium transition-all', active
            ? 'bg-grad-zapusk text-canvas shadow-glow'
            : 'text-secondary hover:text-primary hover:bg-surface'), children: [icon, label] }));
}
